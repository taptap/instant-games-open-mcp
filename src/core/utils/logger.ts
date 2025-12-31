/**
 * MCP-compliant Logger for TapTap Minigame MCP Server
 * Supports RFC 5424 log levels and dual output mode (stderr + MCP notifications + file)
 */

import process from 'node:process';
import * as path from 'node:path';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { stripPrivateParams } from '../types/privateParams.js';
import { EnvConfig } from './env.js';
import { LogWriter, computeStableHash } from './logWriter.js';
import { type LogLevel, LOG_LEVEL_PRIORITY } from '../types/log.js';

// 重新导出 LogLevel 类型，供其他模块使用
export type { LogLevel } from '../types/log.js';

/**
 * Format object for logging
 */
function formatObject(obj: any): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch (error) {
    return String(obj);
  }
}

/**
 * Get current timestamp
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Sanitize sensitive data from objects
 */
function sanitizeData(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'authorization', 'auth'];
  const sanitized = Array.isArray(data) ? [...data] : { ...data };

  for (const key in sanitized) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeData(sanitized[key]);
    }
  }

  return sanitized;
}

/**
 * MCP-compliant Logger class
 */
export class Logger {
  private verbose: boolean;
  private currentLevel: LogLevel = 'info';
  private server?: Server;
  private transport?: 'stdio' | 'sse';
  private logWriter?: LogWriter;

  constructor() {
    this.verbose = EnvConfig.isVerbose;
  }

  /**
   * Initialize logger with MCP server instance
   */
  initialize(server: Server, transport: 'stdio' | 'sse'): void {
    this.server = server;
    this.transport = transport;

    // 初始化文件日志写入器
    this.initializeLogWriter(transport);
  }

  /**
   * 初始化文件日志写入器
   */
  private initializeLogWriter(transport: 'stdio' | 'sse'): void {
    const logRoot = EnvConfig.logRoot;
    const enabled = EnvConfig.logFileEnabled;

    // 计算日志目录
    let logDir: string;
    if (transport === 'stdio') {
      // stdio 模式：按工作区隔离
      const workspaceHash = computeStableHash(path.resolve(EnvConfig.workspaceRoot));
      logDir = path.join(logRoot, 'server', workspaceHash);
    } else {
      // SSE/HTTP 模式：统一日志目录
      logDir = path.join(logRoot, 'server');
    }

    this.logWriter = new LogWriter({
      logDir,
      prefix: 'server',
      enabled,
      level: EnvConfig.logLevel,
      maxDays: EnvConfig.logMaxDays,
    });

    if (enabled) {
      process.stderr.write(`[Logger] File logging enabled: ${logDir}\n`);
    }
  }

  /**
   * Set log level (implements MCP logging/setLevel)
   */
  setLevel(level: LogLevel): void {
    this.currentLevel = level;
    if (this.verbose) {
      process.stderr.write(`[${getTimestamp()}] [LOGGER] Log level set to: ${level}\n`);
    }
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.currentLevel;
  }

  /**
   * Check if a message should be logged based on current level
   */
  private shouldLog(messageLevel: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[messageLevel] <= LOG_LEVEL_PRIORITY[this.currentLevel];
  }

  /**
   * Core logging method with smart output
   *
   * Output strategy:
   * - stderr: 总是输出（MCP 标准行为），只受日志级别过滤
   * - file: 由 logFileEnabled 控制，只受日志级别过滤
   * - MCP notification: 仅在 SSE/HTTP 模式下发送
   *
   * 控制逻辑：
   * - logLevel: 控制哪些级别的日志被输出（到 stderr 和文件）
   * - verbose: 只影响日志级别（verbose=true → logLevel=debug）
   * - logFileEnabled: 单独控制是否写入文件
   *
   * Rationale:
   * - In stdio mode, MCP clients monitor stderr automatically
   * - Sending notifications in stdio may cause duplicate messages
   * - Not all clients support notifications/message properly
   * - File logging provides persistent storage for debugging
   */
  private async log(
    level: LogLevel,
    loggerName: string,
    message: string,
    data?: any
  ): Promise<void> {
    // Check if we should log this level
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = getTimestamp();
    const sanitized = data ? sanitizeData(data) : undefined;

    // 构建日志消息
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] [${loggerName}] ${message}\n`;
    const dataMessage = sanitized !== undefined ? `${formatObject(sanitized)}\n` : '';
    const fullMessage = logMessage + dataMessage;

    // 输出到 stderr 和文件
    // logWriter 使用 Tee 模式（同时写 stderr + 文件），避免重复输出
    if (this.logWriter) {
      await this.logWriter.write(level, fullMessage);
    } else {
      // 没有 logWriter 时，直接写 stderr
      process.stderr.write(fullMessage);
    }

    // Only send MCP notifications in non-stdio modes
    // In stdio mode, clients monitor stderr directly
    if (this.server && this.transport !== 'stdio') {
      try {
        await this.server.notification({
          method: 'notifications/message',
          params: {
            level,
            logger: loggerName,
            data:
              sanitized !== undefined
                ? {
                    message: `[NOTIFICATION:${this.transport}] ${message}`,
                    timestamp,
                    ...sanitized,
                  }
                : { message: `[NOTIFICATION:${this.transport}] ${message}`, timestamp },
          },
        });
      } catch (error) {
        // Silently ignore notification errors to prevent logging loops
      }
    }
  }

  /**
   * Log debug message
   */
  async debug(message: string, data?: any, loggerName: string = 'server'): Promise<void> {
    await this.log('debug', loggerName, message, data);
  }

  /**
   * Log info message
   */
  async info(message: string, data?: any, loggerName: string = 'server'): Promise<void> {
    await this.log('info', loggerName, message, data);
  }

  /**
   * Log notice message
   */
  async notice(message: string, data?: any, loggerName: string = 'server'): Promise<void> {
    await this.log('notice', loggerName, message, data);
  }

  /**
   * Log warning message
   */
  async warning(message: string, data?: any, loggerName: string = 'server'): Promise<void> {
    await this.log('warning', loggerName, message, data);
  }

  /**
   * Log error message
   */
  async error(message: string, error?: any, loggerName: string = 'server'): Promise<void> {
    const data = error instanceof Error ? { error: error.message, stack: error.stack } : { error };
    await this.log('error', loggerName, message, data);
  }

  /**
   * Log critical message
   */
  async critical(message: string, data?: any, loggerName: string = 'server'): Promise<void> {
    await this.log('critical', loggerName, message, data);
  }

  /**
   * Log alert message
   */
  async alert(message: string, data?: any, loggerName: string = 'server'): Promise<void> {
    await this.log('alert', loggerName, message, data);
  }

  /**
   * Log emergency message
   */
  async emergency(message: string, data?: any, loggerName: string = 'server'): Promise<void> {
    await this.log('emergency', loggerName, message, data);
  }

  /**
   * Log tool call with input arguments
   * Note: Automatically strips private parameters (prefixed with '_')
   */
  async logToolCall(toolName: string, args: any): Promise<void> {
    // Extract private parameters for logging
    const privateParams: Record<string, any> = {};
    for (const key in args) {
      if (key.startsWith('_')) {
        privateParams[key] =
          key === '_mac_token'
            ? { ...args[key], mac_key: '***REDACTED***' } // 脱敏 mac_key
            : args[key];
      }
    }

    // Strip private parameters before sanitization
    const argsWithoutPrivate = stripPrivateParams(args);
    const sanitizedArgs = sanitizeData(argsWithoutPrivate);

    // Context: Opening border (stderr only)
    if (this.verbose) {
      process.stderr.write(`\n${'='.repeat(80)}\n`);
    }

    // Key info: Tool call (dual output: stderr + MCP notification)
    await this.log('info', 'tools', `Tool called: ${toolName}`, {
      tool: toolName,
      args: sanitizedArgs,
    });

    // Context: Input details + closing border (stderr only)
    if (this.verbose) {
      process.stderr.write(`📥 Business Args:\n${formatObject(sanitizedArgs)}\n`);

      // 显示私有参数（如果有）
      if (Object.keys(privateParams).length > 0) {
        process.stderr.write(`🔐 Private Params:\n${formatObject(privateParams)}\n`);
      }

      process.stderr.write(`${'='.repeat(80)}\n\n`);
    }
  }

  /**
   * Log tool response with output
   */
  async logToolResponse(toolName: string, output: any, success: boolean = true): Promise<void> {
    const truncatedOutput = typeof output === 'string' ? output.substring(0, 200) : output;

    // Context: Opening border (stderr only)
    if (this.verbose) {
      process.stderr.write(`\n${'-'.repeat(80)}\n`);
    }

    // Key info: Tool response (dual output: stderr + MCP notification)
    await this.log(
      success ? 'info' : 'error',
      'tools',
      `Tool ${success ? 'completed' : 'failed'}: ${toolName}`,
      { tool: toolName, success, output: truncatedOutput }
    );

    // Context: Output details + closing border (stderr only)
    if (this.verbose) {
      const displayOutput =
        typeof output === 'string'
          ? output.substring(0, 500) + (output.length > 500 ? '...(truncated)' : '')
          : formatObject(output);

      process.stderr.write(`📤 Output:\n${displayOutput}\n`);
      process.stderr.write(`${'='.repeat(80)}\n\n`);
    }
  }

  /**
   * Log HTTP request
   */
  async logRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: string
  ): Promise<void> {
    // Sanitize sensitive headers
    const safeHeaders = { ...headers };
    if (safeHeaders['Authorization']) {
      const authHeader = safeHeaders['Authorization'];
      safeHeaders['Authorization'] = authHeader.replace(/mac="[^"]+"/g, 'mac="***REDACTED***"');
    }
    if (safeHeaders['X-Tap-Sign']) {
      safeHeaders['X-Tap-Sign'] = '***REDACTED***';
    }

    const sanitizedBody = body ? sanitizeData(body) : undefined;

    // Context: Opening border + method/url (stderr only)
    if (this.verbose) {
      process.stderr.write(`\n${'='.repeat(100)}\n`);
      process.stderr.write(`📤 Method: ${method}\n`);
      process.stderr.write(`📤 URL: ${url}\n`);
      process.stderr.write(`\n`);
    }

    // Key info: HTTP request summary (dual output: stderr + MCP notification)
    await this.log('debug', 'http', `HTTP ${method} ${url}`, {
      method,
      url,
      headers: safeHeaders,
      body: sanitizedBody,
    });

    // Context: Headers + body details (stderr only)
    if (this.verbose) {
      if (safeHeaders['Authorization']) {
        process.stderr.write(`🔐 Authorization:\n${safeHeaders['Authorization']}\n\n`);
      }

      process.stderr.write(`📋 Headers (${Object.keys(headers).length} total):\n`);
      process.stderr.write(`${formatObject(safeHeaders)}\n`);

      if (body) {
        try {
          const parsedBody = JSON.parse(body);
          process.stderr.write(`\n📦 Request Body (JSON):\n`);
          process.stderr.write(`${formatObject(sanitizeData(parsedBody))}\n`);
        } catch {
          process.stderr.write(`\n📦 Request Body (Raw):\n`);
          process.stderr.write(`${body}\n`);
        }
      } else {
        process.stderr.write(`\n📦 Request Body: (empty)\n`);
      }

      process.stderr.write(`${'='.repeat(100)}\n\n`);
    }
  }

  /**
   * Log HTTP response
   */
  async logResponse(
    method: string,
    url: string,
    status: number,
    statusText: string,
    body: any,
    success: boolean = true,
    responseHeaders?: Record<string, string>
  ): Promise<void> {
    const sanitizedBody = sanitizeData(body);

    // Context: Opening border + method/url/status (stderr only)
    if (this.verbose) {
      process.stderr.write(`\n${'-'.repeat(100)}\n`);
      process.stderr.write(`📥 Method: ${method}\n`);
      process.stderr.write(`📥 URL: ${url}\n`);
      process.stderr.write(`📥 Status: ${status} ${statusText}\n`);
      process.stderr.write(`\n`);
    }

    // Key info: HTTP response summary (dual output: stderr + MCP notification)
    await this.log(
      success ? 'debug' : 'error',
      'http',
      `HTTP ${method} ${url} - ${status} ${statusText}`,
      { method, url, status, statusText, body: sanitizedBody, headers: responseHeaders }
    );

    // Context: Headers + body details (stderr only)
    if (this.verbose) {
      if (responseHeaders && Object.keys(responseHeaders).length > 0) {
        process.stderr.write(
          `📋 Response Headers (${Object.keys(responseHeaders).length} total):\n`
        );
        process.stderr.write(`${formatObject(responseHeaders)}\n\n`);
      }

      if (typeof body === 'string') {
        try {
          const parsedBody = JSON.parse(body);
          process.stderr.write(`📦 Response Body (JSON):\n`);
          process.stderr.write(`${formatObject(sanitizeData(parsedBody))}\n`);
        } catch {
          process.stderr.write(`📦 Response Body (Text):\n`);
          process.stderr.write(`${body}\n`);
        }
      } else if (body !== undefined && body !== null) {
        process.stderr.write(`📦 Response Body (Object):\n`);
        process.stderr.write(`${formatObject(sanitizedBody)}\n`);
      } else {
        process.stderr.write(`📦 Response Body: (empty)\n`);
      }

      process.stderr.write(`${'='.repeat(100)}\n\n`);
    }
  }

  /**
   * Log client connection event
   */
  async logClientConnection(sessionId: string, metadata?: any): Promise<void> {
    const timestamp = getTimestamp();

    // Always output connection event to stderr (important for monitoring)
    process.stderr.write(`\n🔌 [${timestamp}] Client Connected - Session: ${sessionId}\n`);

    // Additional details only in verbose mode
    if (this.verbose) {
      process.stderr.write(`${'='.repeat(80)}\n`);
      process.stderr.write(`Timestamp: ${timestamp}\n`);
      process.stderr.write(`${'='.repeat(80)}\n\n`);
    }

    // Key info: Client connection (dual output: stderr + MCP notification)
    await this.log('info', 'connection', 'Client connected', {
      sessionId,
      event: 'client_connected',
    });
  }

  /**
   * Log client disconnection event
   */
  async logClientDisconnection(sessionId: string): Promise<void> {
    const timestamp = getTimestamp();

    // Always output disconnection event to stderr (important for monitoring)
    process.stderr.write(`\n❌ [${timestamp}] Client Disconnected - Session: ${sessionId}\n`);

    // Additional details only in verbose mode
    if (this.verbose) {
      process.stderr.write(`${'-'.repeat(80)}\n\n`);
    }

    // Key info: Client disconnection (dual output: stderr + MCP notification)
    await this.log('info', 'connection', 'Client disconnected', {
      sessionId,
      event: 'client_disconnected',
    });
  }

  /**
   * Check if verbose mode is enabled
   */
  isVerbose(): boolean {
    return this.verbose;
  }
}

// Export singleton instance
export const logger = new Logger();
