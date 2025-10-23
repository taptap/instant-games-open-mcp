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

    process.stderr.write(`\n${'='.repeat(100)}\n`);
    process.stderr.write(`[${getTimestamp()}] [HTTP REQUEST]\n`);
    process.stderr.write(`${'='.repeat(100)}\n`);

    // 请求基本信息
    process.stderr.write(`📤 Method: ${method}\n`);
    process.stderr.write(`📤 URL: ${url}\n`);
    process.stderr.write(`\n`);

    // 过滤敏感信息
    const safeHeaders = { ...headers };
    if (safeHeaders['Authorization']) {
      const authHeader = safeHeaders['Authorization'];
      // 保留完整的 Authorization header 结构，只隐藏 mac 签名
      safeHeaders['Authorization'] = authHeader.replace(/mac="[^"]+"/g, 'mac="***REDACTED***"');
      // 显示原始的 Authorization（脱敏后）
      process.stderr.write(`🔐 Authorization:\n${safeHeaders['Authorization']}\n\n`);
    }
    if (safeHeaders['X-Tap-Sign']) {
      safeHeaders['X-Tap-Sign'] = '***REDACTED***';
    }

    // 完整的 Headers
    process.stderr.write(`📋 Headers (${Object.keys(headers).length} total):\n`);
    process.stderr.write(`${formatObject(safeHeaders)}\n`);

    // Body 内容
    if (body) {
      let parsedBody: any;
      try {
        parsedBody = JSON.parse(body);
        process.stderr.write(`\n📦 Request Body (JSON):\n`);
        process.stderr.write(`${formatObject(parsedBody)}\n`);
      } catch {
        process.stderr.write(`\n📦 Request Body (Raw):\n`);
        process.stderr.write(`${body}\n`);
      }
    } else {
      process.stderr.write(`\n📦 Request Body: (empty)\n`);
    }
  }

  /**
   * Log HTTP response
   */
  logResponse(method: string, url: string, status: number, statusText: string, body: any, success: boolean = true, responseHeaders?: Record<string, string>): void {
    if (!this.verbose) return;

    process.stderr.write(`\n${'-'.repeat(100)}\n`);
    process.stderr.write(`[${getTimestamp()}] [HTTP RESPONSE] ${success ? '✅ SUCCESS' : '❌ FAILED'}\n`);
    process.stderr.write(`${'-'.repeat(100)}\n`);

    // 响应基本信息
    process.stderr.write(`📥 Method: ${method}\n`);
    process.stderr.write(`📥 URL: ${url}\n`);
    process.stderr.write(`📥 Status: ${status} ${statusText}\n`);
    process.stderr.write(`\n`);

    // 响应头（如果提供）
    if (responseHeaders && Object.keys(responseHeaders).length > 0) {
      process.stderr.write(`📋 Response Headers (${Object.keys(responseHeaders).length} total):\n`);
      process.stderr.write(`${formatObject(responseHeaders)}\n\n`);
    }

    // 响应体
    if (typeof body === 'string') {
      // 尝试解析为 JSON
      try {
        const parsedBody = JSON.parse(body);
        process.stderr.write(`📦 Response Body (JSON):\n`);
        process.stderr.write(`${formatObject(parsedBody)}\n`);
      } catch {
        process.stderr.write(`📦 Response Body (Text):\n`);
        process.stderr.write(`${body}\n`);
      }
    } else if (body !== undefined && body !== null) {
      process.stderr.write(`📦 Response Body (Object):\n`);
      process.stderr.write(`${formatObject(body)}\n`);
    } else {
      process.stderr.write(`📦 Response Body: (empty)\n`);
    }

    process.stderr.write(`${'='.repeat(100)}\n\n`);
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
