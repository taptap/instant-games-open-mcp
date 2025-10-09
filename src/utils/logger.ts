/**
 * Logger utility for TapTap Minigame MCP Server
 * Controlled by TAPTAP_MINIGAME_MCP_VERBOSE environment variable
 */

import process from 'node:process';

/**
 * Check if verbose logging is enabled
 */
function isVerboseEnabled(): boolean {
  return process.env.TAPTAP_MINIGAME_MCP_VERBOSE === 'true' || process.env.TAPTAP_MINIGAME_MCP_VERBOSE === '1';
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
 * Logger class for structured logging
 */
export class Logger {
  private verbose: boolean;

  constructor() {
    this.verbose = isVerboseEnabled();
  }

  /**
   * Log informational message
   */
  info(message: string, data?: any): void {
    if (!this.verbose) return;

    process.stderr.write(`[${getTimestamp()}] [INFO] ${message}\n`);
    if (data !== undefined) {
      process.stderr.write(`${formatObject(data)}\n`);
    }
  }

  /**
   * Log error message
   */
  error(message: string, error?: any): void {
    if (!this.verbose) return;

    process.stderr.write(`[${getTimestamp()}] [ERROR] ${message}\n`);
    if (error !== undefined) {
      if (error instanceof Error) {
        process.stderr.write(`${error.message}\n${error.stack || ''}\n`);
      } else {
        process.stderr.write(`${formatObject(error)}\n`);
      }
    }
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: any): void {
    if (!this.verbose) return;

    process.stderr.write(`[${getTimestamp()}] [DEBUG] ${message}\n`);
    if (data !== undefined) {
      process.stderr.write(`${formatObject(data)}\n`);
    }
  }

  /**
   * Log tool call with input arguments
   */
  logToolCall(toolName: string, args: any): void {
    if (!this.verbose) return;

    process.stderr.write(`\n${'='.repeat(80)}\n`);
    process.stderr.write(`[${getTimestamp()}] [TOOL CALL] ${toolName}\n`);
    process.stderr.write(`${'='.repeat(80)}\n`);
    process.stderr.write(`📥 Input:\n${formatObject(args)}\n`);
  }

  /**
   * Log tool response with output
   */
  logToolResponse(toolName: string, output: any, success: boolean = true): void {
    if (!this.verbose) return;

    process.stderr.write(`\n${'-'.repeat(80)}\n`);
    process.stderr.write(`[${getTimestamp()}] [TOOL RESPONSE] ${toolName} - ${success ? '✅ SUCCESS' : '❌ FAILED'}\n`);
    process.stderr.write(`${'-'.repeat(80)}\n`);
    process.stderr.write(`📤 Output:\n${typeof output === 'string' ? output.substring(0, 500) + (output.length > 500 ? '...(truncated)' : '') : formatObject(output)}\n`);
    process.stderr.write(`${'='.repeat(80)}\n\n`);
  }

  /**
   * Log HTTP request
   */
  logRequest(method: string, url: string, headers: Record<string, string>, body?: string): void {
    if (!this.verbose) return;

    process.stderr.write(`\n${'='.repeat(80)}\n`);
    process.stderr.write(`[${getTimestamp()}] [HTTP REQUEST] ${method} ${url}\n`);
    process.stderr.write(`${'='.repeat(80)}\n`);

    // 过滤敏感信息
    const safeHeaders = { ...headers };
    if (safeHeaders['Authorization']) {
      safeHeaders['Authorization'] = safeHeaders['Authorization'].replace(/mac="[^"]+"/g, 'mac="***"');
    }
    if (safeHeaders['X-Tap-Sign']) {
      safeHeaders['X-Tap-Sign'] = '***';
    }

    process.stderr.write(`📤 Headers:\n${formatObject(safeHeaders)}\n`);

    if (body) {
      process.stderr.write(`📤 Body:\n${body}\n`);
    }
  }

  /**
   * Log HTTP response
   */
  logResponse(method: string, url: string, status: number, statusText: string, body: any, success: boolean = true): void {
    if (!this.verbose) return;

    process.stderr.write(`\n${'-'.repeat(80)}\n`);
    process.stderr.write(`[${getTimestamp()}] [HTTP RESPONSE] ${method} ${url} - ${status} ${statusText} ${success ? '✅' : '❌'}\n`);
    process.stderr.write(`${'-'.repeat(80)}\n`);
    process.stderr.write(`📥 Response:\n${typeof body === 'string' ? body : formatObject(body)}\n`);
    process.stderr.write(`${'='.repeat(80)}\n\n`);
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
