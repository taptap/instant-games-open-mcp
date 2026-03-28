import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HEADER_SEPARATOR = '\r\n\r\n';
const RUNTIME_PACKAGE_NAME = '@mikoto_zero/minigame-open-mcp';
const DEFAULT_INIT_TIMEOUT_MS = 45000;
const DEFAULT_PROTOCOL_VERSION = '2024-11-05';
const ANSI_ESCAPE_REGEX = /\x1B\[[0-?]*[ -/]*[@-~]/g;
const pluginPackageJson = readPluginPackageJson();
const PLUGIN_VERSION = pluginPackageJson?.version || '0.1.0';

function readPluginPackageJson() {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  } catch {
    return null;
  }
}

function getRuntimePackageSpec() {
  const packageJson = readPluginPackageJson();
  const versionRange = packageJson?.dependencies?.[RUNTIME_PACKAGE_NAME];
  return versionRange ? `${RUNTIME_PACKAGE_NAME}@${versionRange}` : `${RUNTIME_PACKAGE_NAME}@latest`;
}

function resolveLocalServerPath() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, '../../../dist/server.js');
}

function resolveInstalledServerPath() {
  try {
    const packageJsonPath = require.resolve(`${RUNTIME_PACKAGE_NAME}/package.json`);
    const packageRoot = path.dirname(packageJsonPath);
    const serverPath = path.join(packageRoot, 'dist', 'server.js');
    if (existsSync(serverPath)) {
      return serverPath;
    }
  } catch {
    // Ignore and keep falling back
  }
  return null;
}

function getManagedRuntimeRoot(config = {}) {
  const cacheRoot = config.cacheDir || path.join(os.tmpdir(), 'taptap-openclaw-plugin');
  return path.join(cacheRoot, 'runtime');
}

function getManagedRuntimeServerPath(config = {}) {
  return path.join(
    getManagedRuntimeRoot(config),
    'node_modules',
    RUNTIME_PACKAGE_NAME,
    'dist',
    'server.js'
  );
}

function getNpmExecutable() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function hasCommand(command) {
  const lookupCommand = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(lookupCommand, [command], {
    stdio: 'ignore',
  });
  return result.status === 0;
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function stripAnsi(text) {
  return text.replace(ANSI_ESCAPE_REGEX, '');
}

function findLikelyFrameStart(buffer) {
  return buffer.indexOf('Content-Length:', 0, 'utf8');
}

function findLikelyJsonStart(buffer) {
  const text = buffer.toString('utf8');
  const candidates = ['{"jsonrpc"', '{"result"', '{"method"', '{"error"', '[{"jsonrpc"'];
  let bestIndex = -1;

  for (const candidate of candidates) {
    const index = text.indexOf(candidate);
    if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
      bestIndex = index;
    }
  }

  return bestIndex;
}

function trimNonProtocolNoise(buffer, logger) {
  const frameStart = findLikelyFrameStart(buffer);
  const jsonStart = findLikelyJsonStart(buffer);

  let start = -1;
  if (frameStart !== -1 && jsonStart !== -1) {
    start = Math.min(frameStart, jsonStart);
  } else {
    start = frameStart !== -1 ? frameStart : jsonStart;
  }

  if (start > 0) {
    const dropped = stripAnsi(buffer.subarray(0, start).toString('utf8')).trim();
    if (dropped) {
      logger?.info?.(`[TapTap DC] Ignoring non-protocol stdout noise: ${dropped.slice(0, 300)}`);
    }
    return buffer.subarray(start);
  }

  return buffer;
}

function looksLikeJsonRpcPayload(text) {
  return /"jsonrpc"\s*:\s*"2\.0"/.test(text) || /"method"\s*:/.test(text) || /"result"\s*:/.test(text);
}

function safeParseJson(text) {
  try {
    return {
      kind: 'ok',
      value: JSON.parse(text),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('Unexpected end of JSON input') ||
      message.includes('Unterminated string') ||
      message.includes('Expected double-quoted property name')
    ) {
      return {
        kind: 'incomplete',
        error,
      };
    }

    return {
      kind: 'invalid',
      error,
    };
  }
}

function parseBareJsonMessage(buffer) {
  const text = buffer.toString('utf8');
  let start = 0;

  while (start < text.length && /\s/.test(text[start])) {
    start += 1;
  }

  const firstChar = text[start];
  if (firstChar !== '{' && firstChar !== '[') {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      depth += 1;
      continue;
    }

    if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) {
        const raw = text.slice(start, index + 1);
        return {
          raw,
          consumedBytes: Buffer.byteLength(text.slice(0, index + 1), 'utf8'),
        };
      }
    }
  }

  return undefined;
}

function findNextMessageOffset(buffer) {
  const framedIndex = buffer.indexOf('Content-Length:', 0, 'utf8');
  const jsonIndex = findLikelyJsonStart(buffer);

  if (framedIndex === -1) {
    return jsonIndex;
  }

  if (jsonIndex === -1) {
    return framedIndex;
  }

  return Math.min(framedIndex, jsonIndex);
}

function parseMessageBuffer(buffer, onMessage, logger) {
  let offset = 0;

  while (offset < buffer.length) {
    while (offset < buffer.length && /\s/.test(String.fromCharCode(buffer[offset]))) {
      offset += 1;
    }

    if (offset >= buffer.length) {
      break;
    }

    const headerEnd = buffer.indexOf(HEADER_SEPARATOR, offset, 'utf8');
    if (headerEnd !== -1) {
      const headerText = buffer.subarray(offset, headerEnd).toString('utf8');
      const contentLengthMatch = headerText.match(/content-length:\s*(\d+)/i);
      if (contentLengthMatch) {
        const contentLength = Number(contentLengthMatch[1]);
        const bodyStart = headerEnd + HEADER_SEPARATOR.length;
        const bodyEnd = bodyStart + contentLength;
        if (buffer.length < bodyEnd) {
          break;
        }

        const bodyText = buffer.subarray(bodyStart, bodyEnd).toString('utf8');
        const parsed = safeParseJson(bodyText);
        if (parsed.kind === 'ok') {
          onMessage(parsed.value);
          offset = bodyEnd;
          continue;
        }

        if (parsed.kind === 'incomplete') {
          break;
        }

        logger?.info?.(
          `[TapTap DC] Ignoring invalid framed MCP payload: ${bodyText.slice(0, 300)}`
        );
        offset = bodyEnd;
        continue;
      }
    }

    const bareJson = parseBareJsonMessage(buffer.subarray(offset));
    if (bareJson) {
      const parsed = safeParseJson(bareJson.raw);
      if (parsed.kind === 'ok') {
        if (looksLikeJsonRpcPayload(bareJson.raw)) {
          onMessage(parsed.value);
        } else {
          logger?.info?.(
            `[TapTap DC] Ignoring bare JSON stdout noise: ${bareJson.raw.slice(0, 300)}`
          );
        }
        offset += bareJson.consumedBytes;
        continue;
      }

      if (parsed.kind === 'incomplete') {
        break;
      }

      logger?.info?.(
        `[TapTap DC] Ignoring invalid bare JSON payload: ${bareJson.raw.slice(0, 300)}`
      );
      offset += bareJson.consumedBytes;
      continue;
    }

    if (bareJson === undefined) {
      break;
    }

    const nextOffset = findNextMessageOffset(buffer.subarray(offset + 1));
    if (nextOffset === -1) {
      break;
    }
    offset += nextOffset + 1;
  }

  return buffer.subarray(offset);
}

function extractTextFromToolResult(result) {
  if (!result || !Array.isArray(result.content)) {
    return JSON.stringify(result, null, 2);
  }

  const parts = result.content
    .filter((item) => item && item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text);

  if (parts.length === 0) {
    return JSON.stringify(result, null, 2);
  }

  return parts.join('\n\n');
}

export class TapTapMcpBridge {
  constructor(options = {}) {
    this.logger = options.logger;
    this.config = options.config || {};
    this.child = null;
    this.readyPromise = null;
    this.installPromise = null;
    this.pending = new Map();
    this.outboundMessages = [];
    this.nextId = 1;
    this.stdoutBuffer = Buffer.alloc(0);
  }

  buildEnv() {
    const env = {
      ...process.env,
      TAPTAP_MCP_TRANSPORT: 'stdio',
      TAPTAP_MCP_ENV: this.config.environment || 'production',
      TAPTAP_MCP_ENABLE_RAW_TOOLS: 'true',
      npm_config_loglevel: process.env.npm_config_loglevel || 'error',
      npm_config_update_notifier: 'false',
      npm_config_fund: 'false',
      npm_config_audit: 'false',
    };

    if (this.config.workspaceRoot) {
      env.TAPTAP_MCP_WORKSPACE_ROOT = this.config.workspaceRoot;
    }
    if (this.config.cacheDir) {
      env.TAPTAP_MCP_CACHE_DIR = this.config.cacheDir;
    }
    if (this.config.tempDir) {
      env.TAPTAP_MCP_TEMP_DIR = this.config.tempDir;
    }
    if (this.config.logRoot) {
      env.TAPTAP_MCP_LOG_ROOT = this.config.logRoot;
    }
    if (this.config.verbose) {
      env.TAPTAP_MCP_VERBOSE = 'true';
    }

    return env;
  }

  async resolveRuntimeServer() {
    const installedServerPath = resolveInstalledServerPath();
    if (installedServerPath) {
      return {
        source: 'package dependency',
        serverPath: installedServerPath,
      };
    }

    const localServerPath = resolveLocalServerPath();
    if (existsSync(localServerPath)) {
      return {
        source: 'local workspace build',
        serverPath: localServerPath,
      };
    }

    const managedServerPath = getManagedRuntimeServerPath(this.config);
    if (existsSync(managedServerPath)) {
      return {
        source: 'plugin runtime cache',
        serverPath: managedServerPath,
      };
    }

    const installedManagedServerPath = await this.installRuntimePackage();
    return {
      source: 'plugin runtime cache (fresh install)',
      serverPath: installedManagedServerPath,
    };
  }

  async installRuntimePackage() {
    if (this.installPromise) {
      return this.installPromise;
    }

    this.installPromise = this.installRuntimePackageInternal();

    try {
      return await this.installPromise;
    } finally {
      this.installPromise = null;
    }
  }

  async installRuntimePackageInternal() {
    const runtimeRoot = getManagedRuntimeRoot(this.config);
    const managedServerPath = getManagedRuntimeServerPath(this.config);
    const packageSpec = getRuntimePackageSpec();
    const npmCacheDir = path.join(runtimeRoot, '.npm-cache');

    mkdirSync(runtimeRoot, { recursive: true });
    mkdirSync(npmCacheDir, { recursive: true });

    this.logger?.info?.(
      `[TapTap DC] Local TapTap MCP runtime not found, installing ${packageSpec} into ${runtimeRoot}`
    );

    await new Promise((resolve, reject) => {
      const child = spawn(
        getNpmExecutable(),
        [
          'install',
          '--no-save',
          '--no-package-lock',
          '--omit=dev',
          '--prefix',
          runtimeRoot,
          packageSpec,
        ],
        {
          env: {
            ...this.buildEnv(),
            npm_config_cache: npmCacheDir,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );

      let output = '';
      const appendOutput = (chunk) => {
        const text = chunk.toString('utf8');
        output += text;
        const trimmed = text.trim();
        if (trimmed) {
          this.logger?.info?.(`[TapTap DC][npm] ${trimmed}`);
        }
      };

      child.stdout.on('data', appendOutput);
      child.stderr.on('data', appendOutput);

      child.on('error', (error) => {
        reject(error);
      });

      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(
          new Error(
            `npm install failed with code ${code ?? 'null'}. ${output.trim() || 'No additional output.'}`
          )
        );
      });
    });

    if (!existsSync(managedServerPath)) {
      throw new Error(
        `TapTap MCP runtime install finished but server entry is still missing: ${managedServerPath}`
      );
    }

    return managedServerPath;
  }

  async ensureReady() {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = this.start();
    return this.readyPromise;
  }

  async start() {
    const runtime = await this.resolveRuntimeServer();
    const launchAttempts = this.getLaunchAttempts(runtime.serverPath);
    const errors = [];

    for (const attempt of launchAttempts) {
      this.logger?.info?.(
        `[TapTap DC] Starting embedded TapTap MCP runtime from ${runtime.source} using ${attempt.label}: ${runtime.serverPath}`
      );

      this.spawnChild(attempt.command, attempt.args);

      try {
        await this.initializeServer();
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${attempt.label}: ${message}`);
        this.logger?.info?.(
          `[TapTap DC] Runtime start attempt failed via ${attempt.label}, retrying if possible: ${message}`
        );
        await this.close();
      }
    }

    throw new Error(
      `Failed to start embedded TapTap MCP runtime. Attempts: ${errors.join(' | ')}`
    );
  }

  handleMessage(message) {
    if (this.isEchoedOutboundMessage(message)) {
      return;
    }

    if (message.id !== undefined && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);

      if (message.error) {
        pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
        return;
      }

      pending.resolve(message.result);
      return;
    }
  }

  send(message) {
    if (!this.child?.stdin) {
      throw new Error('Embedded TapTap MCP server is not running.');
    }

    this.outboundMessages.push({
      id: message.id,
      method: message.method,
      payload: JSON.stringify(message),
    });
    if (this.outboundMessages.length > 20) {
      this.outboundMessages.shift();
    }

    const body = JSON.stringify(message);
    this.child.stdin.write(`${body}\n`, 'utf8');
  }

  request(method, params) {
    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({
        jsonrpc: '2.0',
        id,
        method,
        params,
      });
    });
  }

  notify(method, params) {
    this.send({
      jsonrpc: '2.0',
      method,
      params,
    });
  }

  async callTool(name, args = {}) {
    await this.ensureReady();
    const result = await this.request('tools/call', {
      name,
      arguments: args,
    });
    return extractTextFromToolResult(result);
  }

  async close() {
    if (this.child) {
      this.child.kill();
      this.child = null;
      this.readyPromise = null;
    }
    this.pending.clear();
    this.outboundMessages = [];
  }

  getLaunchAttempts(serverPath) {
    const attempts = [
      {
        label: 'direct stdio',
        command: process.execPath,
        args: [serverPath],
      },
    ];

    if (hasCommand('stdbuf')) {
      attempts.push({
        label: 'stdbuf unbuffered stdio',
        command: 'stdbuf',
        args: ['-i0', '-o0', '-e0', process.execPath, serverPath],
      });
    }

    if (process.platform === 'darwin' && hasCommand('script')) {
      attempts.push({
        label: 'script pty wrapper',
        command: 'script',
        args: ['-q', '/dev/null', process.execPath, serverPath],
      });
    }

    if (process.platform === 'linux' && hasCommand('script')) {
      attempts.push({
        label: 'script pty wrapper',
        command: 'script',
        args: ['-q', '-e', '-c', `${shellEscape(process.execPath)} ${shellEscape(serverPath)}`, '/dev/null'],
      });
    }

    return attempts;
  }

  spawnChild(command, args) {
    this.child = spawn(command, args, {
      env: this.buildEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.stdoutBuffer = Buffer.alloc(0);

    this.child.stdout.on('data', (chunk) => {
      try {
        this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
        this.stdoutBuffer = trimNonProtocolNoise(this.stdoutBuffer, this.logger);
        this.stdoutBuffer = parseMessageBuffer(
          this.stdoutBuffer,
          (message) => this.handleMessage(message),
          this.logger
        );
      } catch (error) {
        this.logger?.error?.(
          `[TapTap DC] Failed to parse MCP stdout: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        this.stdoutBuffer = trimNonProtocolNoise(this.stdoutBuffer, this.logger);
      }
    });

    this.child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8').trim();
      if (text) {
        this.logger?.info?.(`[TapTap MCP] ${text}`);
      }
    });

    this.child.on('exit', (code, signal) => {
      const error = new Error(
        `Embedded TapTap MCP server exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'}).`
      );
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
      this.child = null;
      this.readyPromise = null;
    });
  }

  async initializeServer() {
    await Promise.race([
      this.request('initialize', {
        protocolVersion: DEFAULT_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: 'taptap-openclaw-dc-plugin',
          version: PLUGIN_VERSION,
        },
      }),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new Error(
              `Initialize handshake timed out after ${DEFAULT_INIT_TIMEOUT_MS}ms`
            )
          );
        }, DEFAULT_INIT_TIMEOUT_MS);
      }),
    ]);

    this.notify('notifications/initialized', {});
  }

  isEchoedOutboundMessage(message) {
    if (!message || typeof message !== 'object' || !message.method) {
      return false;
    }

    const payload = JSON.stringify(message);
    return this.outboundMessages.some(
      (entry) =>
        entry.payload === payload ||
        (entry.id !== undefined && entry.id === message.id && entry.method === message.method)
    );
  }
}
