/**
 * MCP-compliant Logger for TapTap Minigame MCP Server
 * Supports RFC 5424 log levels and dual output mode (stderr + MCP notifications)
 */

import process from 'node:process';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * RFC 5424 log levels (syslog severity levels)
 */
export type LogLevel =
  | 'debug'     // 7 - Debug-level messages
  | 'info'      // 6 - Informational messages
  | 'notice'    // 5 - Normal but significant condition
  | 'warning'   // 4 - Warning conditions
  | 'error'     // 3 - Error conditions
  | 'critical'  // 2 - Critical conditions
  | 'alert'     // 1 - Action must be taken immediately
  | 'emergency';// 0 - System is unusable

/**
 * Log level priorities (lower number = higher severity)
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  'emergency': 0,
  'alert': 1,
  'critical': 2,
  'error': 3,
  'warning': 4,
  'notice': 5,
  'info': 6,
  'debug': 7,
};

/**
 * Check if verbose logging is enabled
 */
function isVerboseEnabled(): boolean {
  return process.env.TDS_MCP_VERBOSE === 'true' || process.env.TDS_MCP_VERBOSE === '1';
}

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
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
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

  constructor() {
    this.verbose = isVerboseEnabled();
  }

  /**
   * Initialize logger with MCP server instance
   */
  initialize(server: Server, transport: 'stdio' | 'sse'): void {
    this.server = server;
    this.transport = transport;
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
   * Core logging method with dual output
   * Pure dual-write: simple stderr + MCP notification
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

    // Output 1: Simple stderr (for local debugging)
    if (this.verbose) {
      process.stderr.write(`[${timestamp}] [${level.toUpperCase()}] [${loggerName}] ${message}\n`);
      if (sanitized !== undefined) {
        process.stderr.write(`${formatObject(sanitized)}\n`);
      }
    }

    // Output 2: MCP notifications (for client)
    if (this.server) {
      try {
        await this.server.notification({
          method: 'notifications/message',
          params: {
            level,
            logger: loggerName,
            data: sanitized !== undefined
              ? { message, timestamp, ...sanitized }
              : { message, timestamp }
          }
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
    const data = error instanceof Error
      ? { error: error.message, stack: error.stack }
      : { error };
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
   */
  async logToolCall(toolName: string, args: any): Promise<void> {
    const sanitizedArgs = sanitizeData(args);

    // Context: Opening border (stderr only)
    if (this.verbose) {
      process.stderr.write(`\n${'='.repeat(80)}\n`);
    }

    // Key info: Tool call (dual output: stderr + MCP notification)
    await this.log(
      'info',
      'tools',
      `Tool called: ${toolName}`,
      { tool: toolName, args: sanitizedArgs }
    );

    // Context: Input details + closing border (stderr only)
    if (this.verbose) {
      process.stderr.write(`📥 Input:\n${formatObject(sanitizedArgs)}\n`);
      process.stderr.write(`${'='.repeat(80)}\n\n`);
    }
  }

  /**
   * Log tool response with output
   */
  async logToolResponse(toolName: string, output: any, success: boolean = true): Promise<void> {
    const truncatedOutput = typeof output === 'string'
      ? output.substring(0, 200)
      : output;

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
      const displayOutput = typeof output === 'string'
        ? output.substring(0, 500) + (output.length > 500 ? '...(truncated)' : '')
        : formatObject(output);

      process.stderr.write(`📤 Output:\n${displayOutput}\n`);
      process.stderr.write(`${'='.repeat(80)}\n\n`);
    }
  }

  /**
   * Log HTTP request
   */
  async logRequest(method: string, url: string, headers: Record<string, string>, body?: string): Promise<void> {
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
    await this.log(
      'debug',
      'http',
      `HTTP ${method} ${url}`,
      { method, url, headers: safeHeaders, body: sanitizedBody }
    );

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
        process.stderr.write(`📋 Response Headers (${Object.keys(responseHeaders).length} total):\n`);
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
  async logClientConnection(sessionId: string): Promise<void> {
    // Context: Connection event (stderr only)
    if (this.verbose) {
      process.stderr.write(`\n${'='.repeat(80)}\n`);
      process.stderr.write(`🔌 Client Connected\n`);
      process.stderr.write(`Session ID: ${sessionId}\n`);
      process.stderr.write(`Timestamp: ${getTimestamp()}\n`);
      process.stderr.write(`${'='.repeat(80)}\n\n`);
    }

    // Key info: Client connection (dual output: stderr + MCP notification)
    await this.log(
      'info',
      'connection',
      'Client connected',
      { sessionId, event: 'client_connected' }
    );
  }

  /**
   * Log client disconnection event
   */
  async logClientDisconnection(sessionId: string): Promise<void> {
    // Context: Disconnection event (stderr only)
    if (this.verbose) {
      process.stderr.write(`\n${'-'.repeat(80)}\n`);
      process.stderr.write(`🔌 Client Disconnected\n`);
      process.stderr.write(`Session ID: ${sessionId}\n`);
      process.stderr.write(`Timestamp: ${getTimestamp()}\n`);
      process.stderr.write(`${'='.repeat(80)}\n\n`);
    }

    // Key info: Client disconnection (dual output: stderr + MCP notification)
    await this.log(
      'info',
      'connection',
      'Client disconnected',
      { sessionId, event: 'client_disconnected' }
    );
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
