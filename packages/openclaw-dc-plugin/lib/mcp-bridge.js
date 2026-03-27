import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HEADER_SEPARATOR = '\r\n\r\n';

function resolveLocalServerPath() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, '../../../dist/server.js');
}

function resolveEmbeddedServerPath() {
  try {
    const packageJsonPath = require.resolve('@mikoto_zero/minigame-open-mcp/package.json');
    const packageRoot = path.dirname(packageJsonPath);
    const serverPath = path.join(packageRoot, 'dist', 'server.js');
    if (existsSync(serverPath)) {
      return serverPath;
    }
  } catch {
    // Fall through to local dev path
  }

  const localServerPath = resolveLocalServerPath();
  if (existsSync(localServerPath)) {
    return localServerPath;
  }

  throw new Error(
    'Unable to resolve the embedded TapTap MCP server. Make sure @mikoto_zero/minigame-open-mcp is installed.'
  );
}

function parseMessageBuffer(buffer, onMessage) {
  let offset = 0;

  while (offset < buffer.length) {
    const headerEnd = buffer.indexOf(HEADER_SEPARATOR, offset, 'utf8');
    if (headerEnd === -1) {
      break;
    }

    const headerText = buffer.subarray(offset, headerEnd).toString('utf8');
    const contentLengthMatch = headerText.match(/content-length:\s*(\d+)/i);
    if (!contentLengthMatch) {
      throw new Error(`Missing Content-Length header in MCP frame: ${headerText}`);
    }

    const contentLength = Number(contentLengthMatch[1]);
    const bodyStart = headerEnd + HEADER_SEPARATOR.length;
    const bodyEnd = bodyStart + contentLength;
    if (buffer.length < bodyEnd) {
      break;
    }

    const bodyText = buffer.subarray(bodyStart, bodyEnd).toString('utf8');
    onMessage(JSON.parse(bodyText));
    offset = bodyEnd;
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
    this.pending = new Map();
    this.nextId = 1;
    this.stdoutBuffer = Buffer.alloc(0);
  }

  buildEnv() {
    const env = {
      ...process.env,
      TAPTAP_MCP_TRANSPORT: 'stdio',
      TAPTAP_MCP_ENV: this.config.environment || 'production',
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

  async ensureReady() {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = this.start();
    return this.readyPromise;
  }

  async start() {
    const serverPath = resolveEmbeddedServerPath();
    this.child = spawn(process.execPath, [serverPath], {
      env: this.buildEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.stdout.on('data', (chunk) => {
      try {
        this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
        this.stdoutBuffer = parseMessageBuffer(this.stdoutBuffer, (message) =>
          this.handleMessage(message)
        );
      } catch (error) {
        this.logger?.error?.(
          `[TapTap DC] Failed to parse MCP stdout: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
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

    await this.request('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {
        tools: {},
        resources: {},
        logging: {},
      },
      clientInfo: {
        name: 'taptap-openclaw-dc-plugin',
        version: '0.1.0',
      },
    });

    this.notify('notifications/initialized', {});
  }

  handleMessage(message) {
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

    const body = JSON.stringify(message);
    const frame = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
    this.child.stdin.write(frame, 'utf8');
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
  }
}
