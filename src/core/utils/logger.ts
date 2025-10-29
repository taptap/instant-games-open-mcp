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
   * Supports both simple and enhanced formats
   */
  private async log(
    level: LogLevel,
    loggerName: string,
    message: string,
    data?: any,
    enhancedFormat?: {
      type: 'tool-call' | 'tool-response' | 'http-request' | 'http-response';
      details?: any;
    }
  ): Promise<void> {
    // Check if we should log this level
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = getTimestamp();
    const sanitized = data ? sanitizeData(data) : undefined;

    // Output 1: stderr (for local debugging)
    if (this.verbose) {
      if (enhancedFormat) {
        // Enhanced format for special log types
        this.writeEnhancedStderr(enhancedFormat, timestamp, message, sanitized);
      } else {
        // Simple format for general logs
        process.stderr.write(`[${timestamp}] [${level.toUpperCase()}] [${loggerName}] ${message}\n`);
        if (sanitized !== undefined) {
          process.stderr.write(`${formatObject(sanitized)}\n`);
        }
      }
    }

    // Output 2: MCP notifications (for client)
    // Important for HTTP/SSE mode where client can't capture stderr
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
        if (this.verbose) {
          process.stderr.write(`[${timestamp}] [WARNING] Failed to send log notification: ${error}\n`);
        }
      }
    }
  }

  /**
   * Write enhanced stderr format for special log types
   */
  private writeEnhancedStderr(
    format: { type: string; details?: any },
    timestamp: string,
    message: string,
    data?: any
  ): void {
    switch (format.type) {
      case 'tool-call':
        process.stderr.write(`\n${'='.repeat(80)}\n`);
        process.stderr.write(`[${timestamp}] [TOOL CALL] ${format.details?.toolName || 'Unknown'}\n`);
        process.stderr.write(`${'='.repeat(80)}\n`);
        process.stderr.write(`📥 Input:\n${formatObject(data?.args || {})}\n`);
        break;

      case 'tool-response':
        process.stderr.write(`\n${'-'.repeat(80)}\n`);
        process.stderr.write(`[${timestamp}] [TOOL RESPONSE] ${format.details?.toolName || 'Unknown'} - ${format.details?.success ? '✅ SUCCESS' : '❌ FAILED'}\n`);
        process.stderr.write(`${'-'.repeat(80)}\n`);
        const displayOutput = format.details?.displayOutput || '';
        process.stderr.write(`📤 Output:\n${displayOutput}\n`);
        process.stderr.write(`${'='.repeat(80)}\n\n`);
        break;

      case 'http-request':
        process.stderr.write(`\n${'='.repeat(100)}\n`);
        process.stderr.write(`[${timestamp}] [HTTP REQUEST]\n`);
        process.stderr.write(`${'='.repeat(100)}\n`);
        process.stderr.write(`📤 Method: ${data?.method}\n`);
        process.stderr.write(`📤 URL: ${data?.url}\n`);
        process.stderr.write(`\n`);
        if (data?.headers?.Authorization) {
          process.stderr.write(`🔐 Authorization:\n${data.headers.Authorization}\n\n`);
        }
        process.stderr.write(`📋 Headers (${Object.keys(data?.headers || {}).length} total):\n`);
        process.stderr.write(`${formatObject(data?.headers || {})}\n`);
        if (format.details?.bodyDisplay) {
          process.stderr.write(format.details.bodyDisplay);
        }
        break;

      case 'http-response':
        process.stderr.write(`\n${'-'.repeat(100)}\n`);
        process.stderr.write(`[${timestamp}] [HTTP RESPONSE] ${format.details?.success ? '✅ SUCCESS' : '❌ FAILED'}\n`);
        process.stderr.write(`${'-'.repeat(100)}\n`);
        process.stderr.write(`📥 Method: ${data?.method}\n`);
        process.stderr.write(`📥 URL: ${data?.url}\n`);
        process.stderr.write(`📥 Status: ${data?.status} ${data?.statusText}\n`);
        process.stderr.write(`\n`);
        if (data?.headers && Object.keys(data.headers).length > 0) {
          process.stderr.write(`📋 Response Headers (${Object.keys(data.headers).length} total):\n`);
          process.stderr.write(`${formatObject(data.headers)}\n\n`);
        }
        if (format.details?.bodyDisplay) {
          process.stderr.write(format.details.bodyDisplay);
        }
        process.stderr.write(`${'='.repeat(100)}\n\n`);
        break;
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

    // Use unified log method with enhanced format
    await this.log(
      'info',
      'tools',
      `Tool called: ${toolName}`,
      { tool: toolName, args: sanitizedArgs },
      {
        type: 'tool-call',
        details: { toolName }
      }
    );
  }

  /**
   * Log tool response with output
   */
  async logToolResponse(toolName: string, output: any, success: boolean = true): Promise<void> {
    const truncatedOutput = typeof output === 'string'
      ? output.substring(0, 200)
      : output;

    const displayOutput = typeof output === 'string'
      ? output.substring(0, 500) + (output.length > 500 ? '...(truncated)' : '')
      : formatObject(output);

    // Use unified log method with enhanced format
    await this.log(
      success ? 'info' : 'error',
      'tools',
      `Tool ${success ? 'completed' : 'failed'}: ${toolName}`,
      { tool: toolName, success, output: truncatedOutput },
      {
        type: 'tool-response',
        details: { toolName, success, displayOutput }
      }
    );
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

    // Prepare body display for stderr
    let bodyDisplay = '';
    if (body) {
      try {
        const parsedBody = JSON.parse(body);
        bodyDisplay = `\n📦 Request Body (JSON):\n${formatObject(sanitizeData(parsedBody))}\n`;
      } catch {
        bodyDisplay = `\n📦 Request Body (Raw):\n${body}\n`;
      }
    } else {
      bodyDisplay = `\n📦 Request Body: (empty)\n`;
    }

    // Use unified log method with enhanced format
    await this.log(
      'debug',
      'http',
      `HTTP ${method} ${url}`,
      { method, url, headers: safeHeaders, body: sanitizedBody },
      {
        type: 'http-request',
        details: { bodyDisplay }
      }
    );
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

    // Prepare body display for stderr
    let bodyDisplay = '';
    if (typeof body === 'string') {
      try {
        const parsedBody = JSON.parse(body);
        bodyDisplay = `📦 Response Body (JSON):\n${formatObject(sanitizeData(parsedBody))}\n`;
      } catch {
        bodyDisplay = `📦 Response Body (Text):\n${body}\n`;
      }
    } else if (body !== undefined && body !== null) {
      bodyDisplay = `📦 Response Body (Object):\n${formatObject(sanitizedBody)}\n`;
    } else {
      bodyDisplay = `📦 Response Body: (empty)\n`;
    }

    // Use unified log method with enhanced format
    await this.log(
      success ? 'debug' : 'error',
      'http',
      `HTTP ${method} ${url} - ${status} ${statusText}`,
      { method, url, status, statusText, body: sanitizedBody, headers: responseHeaders },
      {
        type: 'http-response',
        details: { success, bodyDisplay }
      }
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
