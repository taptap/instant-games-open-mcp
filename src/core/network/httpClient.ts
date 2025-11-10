/**
 * HTTP Client for TapTap API Requests
 * Handles MAC authentication, request signing, headers, and error responses
 */

import process from 'node:process';
import cryptoJS from 'crypto-js';
import { MacToken } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Environment configuration
 */
export class ApiConfig {
  private static instance: ApiConfig;

  public macToken: MacToken;  // Changed from readonly to allow runtime updates
  public readonly clientId: string;
  public readonly signingKey: string;  // API request signature key (HMAC-SHA256)
  public readonly apiBaseUrl: string;
  public readonly environment: 'rnd' | 'production';

  private constructor() {
    // Optional: default to production
    this.environment = (process.env.TDS_MCP_ENV === 'rnd') ? 'rnd' : 'production';

    // Built-in OAuth Client ID (public, safe to include)
    // These match the values in deviceFlow.ts for OAuth consistency
    const DEFAULT_CLIENT_ID = this.environment === 'production'
      ? 'cadxxoz247zw0ug5i2'  // Production OAuth client ID (public)
      : 'm2dnabebip3fpardnm';  // RND OAuth client ID (public)

    // Environment variables (TDS_MCP_* prefix for consistency)
    const macTokenStr = process.env.TDS_MCP_MAC_TOKEN || '';
    this.clientId = process.env.TDS_MCP_CLIENT_ID || DEFAULT_CLIENT_ID;
    // CLIENT_TOKEN must be provided via environment variable (keep it secret!)
    this.signingKey = process.env.TDS_MCP_CLIENT_TOKEN || '';

    // Parse MAC Token from JSON string (optional now, can be set later via Device Flow)
    try {
      this.macToken = macTokenStr ? JSON.parse(macTokenStr) : {} as MacToken;
    } catch (error) {
      process.stderr.write('⚠️  Failed to parse TDS_MCP_MAC_TOKEN from environment, will use OAuth flow\n');
      this.macToken = {} as MacToken;
    }

    // Set API base URL based on environment
    this.apiBaseUrl = this.environment === 'production'
      ? 'https://agent.tapapis.cn'
      : 'https://agent.api.xdrnd.cn';

    // Validate configuration
    this.validateConfig();
  }

  private validateConfig(): void {
    // Client Token is required for API signing (keep it secret!)
    if (!this.signingKey) {
      process.stderr.write('❌ Missing required environment variable: TDS_MCP_CLIENT_TOKEN\n\n');
      process.stderr.write('This is the API request signing key (keep it secret!).\n');
      process.stderr.write('Please set it before starting the server:\n\n');
      process.stderr.write('  export TDS_MCP_CLIENT_TOKEN="your_signing_key"\n\n');
      process.stderr.write('Contact TapTap support to get your CLIENT_TOKEN.\n\n');
      process.exit(1);
    }

    // Show info about CLIENT_ID
    if (!process.env.TDS_MCP_CLIENT_ID) {
      process.stderr.write(`ℹ️  Using built-in OAuth CLIENT_ID: ${this.clientId}\n`);
    }
  }

  public static getInstance(): ApiConfig {
    if (!ApiConfig.instance) {
      ApiConfig.instance = new ApiConfig();
    }
    return ApiConfig.instance;
  }

  /**
   * Set MAC Token (called by Device Flow or manual configuration)
   */
  public setMacToken(token: MacToken): void {
    this.macToken = token;
  }

  public isConfigured(): boolean {
    return !!(this.macToken.kid && this.macToken.mac_key && this.clientId && this.signingKey);
  }

  public getConfigStatus(): Record<string, string> {
    return {
      'TDS_MCP_MAC_TOKEN': this.macToken.kid ? `✅ 已配置 (kid: ${this.macToken.kid.substring(0, 8)}...)` : '❌ 未配置',
      'TDS_MCP_CLIENT_ID': this.clientId ? '✅ 已配置' : '❌ 未配置',
      'TDS_MCP_CLIENT_TOKEN': this.signingKey ? '✅ 已配置' : '❌ 未配置',
      'TDS_MCP_ENV': `${this.environment} (${this.apiBaseUrl})`,
    };
  }

  /**
   * Get current environment
   */
  public getEnvironment(): 'rnd' | 'production' {
    return this.environment;
  }
}

/**
 * HTTP request options
 */
export interface RequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string>;
  timeout?: number;
}

/**
 * HTTP response wrapper
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/**
 * Generic HTTP Client for TapTap API
 */
export class HttpClient {
  private config: ApiConfig;
  private overrideMacToken?: MacToken;

  /**
   * @param context - Optional handler context (for macToken and projectPath)
   */
  constructor(context?: import('../types/index.js').HandlerContext) {
    this.config = ApiConfig.getInstance();
    this.overrideMacToken = context?.macToken;
  }

  /**
   * Make a GET request
   */
  async get<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('GET', path, options);
  }

  /**
   * Make a POST request
   */
  async post<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('POST', path, options);
  }

  /**
   * Generic request method with MAC authentication and signature
   */
  private async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    // Build full URL with query parameters
    let fullUrl = `${this.config.apiBaseUrl}${path}`;
    let signUrl = new URL(fullUrl).pathname;

    // Add client_id to query params
    const queryParams = new URLSearchParams();
    queryParams.append('client_id', this.config.clientId);

    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        queryParams.append(key, value);
      });
    }

    fullUrl += '?' + queryParams.toString();
    signUrl += '?' + queryParams.toString();

    // Prepare request body
    let bodyString = method === 'POST' ? '{}' : '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (options.body) {
      if (headers['Content-Type'] === 'application/x-www-form-urlencoded') {
        // Form-encoded body
        const formData = new URLSearchParams();
        Object.entries(options.body as Record<string, unknown>).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            formData.append(key, String(value));
          }
        });
        bodyString = formData.toString();
      } else {
        // JSON body
        bodyString = JSON.stringify(options.body);
      }
    }

    // MAC Token 优先级：constructor macToken > global config
    const effectiveMacToken = this.overrideMacToken || this.config.macToken;

    // Generate MAC Authorization header
    const authorization = this.generateMacAuthorization(fullUrl, method, effectiveMacToken);
    headers['Authorization'] = authorization;

    // Add timestamp and nonce headers
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = this.generateRandomString(8);
    headers['X-Tap-Ts'] = timestamp;
    headers['X-Tap-Nonce'] = nonce;

    // Calculate signature using CLIENT_SECRET
    const signature = this.generateSignature(method, signUrl, headers, bodyString);
    headers['X-Tap-Sign'] = signature;

    // Log request
    await logger.logRequest(method, fullUrl, headers, bodyString);

    // Set up timeout
    const controller = new AbortController();
    const timeout = options.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // @ts-ignore - fetch is available in Node.js 18+
      const response = await fetch(fullUrl, {
        method,
        headers,
        body: bodyString || undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Extract response headers
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // Handle non-OK responses
      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        let errorBody: any = null;

        if (contentType?.includes('application/json')) {
          const errorData = await response.json() as any;
          errorBody = errorData;
          errorMessage += ` - ${errorData.message || errorData.error || JSON.stringify(errorData)}`;

          // Check for access_denied error (token expired or invalid)
          if (errorData.data?.error === 'access_denied' ||
              errorData.error === 'access_denied' ||
              response.status === 401) {
            const authError = new Error(
              `🔐 授权已失效\n\n` +
              `您的 MAC Token 已过期或无效。\n\n` +
              `📋 解决方案：\n` +
              `1. 调用 clear_auth_data 工具清除过期的认证数据\n` +
              `2. 调用需要认证的工具会自动触发新的授权流程\n` +
              `3. 使用 TapTap App 扫码重新授权\n\n` +
              `💡 提示：如果使用的是环境变量中的 Token，请更新 TDS_MCP_MAC_TOKEN 环境变量并重启服务器。`
            );
            (authError as any).isAuthError = true;

            // Log auth error
            await logger.logResponse(method, fullUrl, response.status, response.statusText, errorBody, false, responseHeaders);

            throw authError;
          }
        } else {
          const errorText = await response.text();
          errorBody = errorText;
          errorMessage += ` - ${errorText}`;

          // Check for RBAC access denied (text/plain format)
          if ((response.status === 403 || response.status === 401) &&
              (errorText.includes('access denied') || errorText.includes('RBAC'))) {
            const authError = new Error(
              `🔐 授权已失效\n\n` +
              `您的 MAC Token 已过期或无效。\n\n` +
              `📋 解决方案：\n` +
              `1. 调用 clear_auth_data 工具清除过期的认证数据\n` +
              `2. 调用需要认证的工具会自动触发新的授权流程\n` +
              `3. 使用 TapTap App 扫码重新授权\n\n` +
              `💡 提示：如果使用的是环境变量中的 Token，请更新 TDS_MCP_MAC_TOKEN 环境变量并重启服务器。`
            );
            (authError as any).isAuthError = true;

            // Log auth error
            await logger.logResponse(method, fullUrl, response.status, response.statusText, errorBody, false, responseHeaders);

            throw authError;
          }
        }

        // Log error response with headers
        await logger.logResponse(method, fullUrl, response.status, response.statusText, errorBody, false, responseHeaders);

        throw new Error(errorMessage);
      }

      // Parse response
      const contentType = response.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        const jsonData = await response.json() as ApiResponse<T>;

        // Log successful response with headers
        await logger.logResponse(method, fullUrl, response.status, response.statusText, jsonData, true, responseHeaders);

        // Handle API response format
        if (jsonData.success === false) {
          throw new Error(jsonData.message || jsonData.error || 'API request failed');
        }

        // Return data field if available, otherwise return full response
        return (jsonData.data !== undefined ? jsonData.data : jsonData) as T;
      }

      // If not JSON, return text
      const text = await response.text();

      // Log text response with headers
      await logger.logResponse(method, fullUrl, response.status, response.statusText, text, true, responseHeaders);

      return text as T;

    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          const timeoutError = new Error(`Request timeout after ${timeout}ms`);
          await logger.error(`HTTP Request timeout: ${method} ${fullUrl}`, timeoutError);
          throw timeoutError;
        }
        await logger.error(`HTTP Request failed: ${method} ${fullUrl}`, error);
        throw error;
      }

      const genericError = new Error(`Request failed: ${String(error)}`);
      await logger.error(`HTTP Request failed: ${method} ${fullUrl}`, genericError);
      throw genericError;
    }
  }

  /**
   * Generate MAC Authorization header
   * Format: MAC id="kid", ts="timestamp", nonce="random", mac="signature"
   */
  private generateMacAuthorization(requestUrl: string, method: string, macToken: MacToken): string {
    const url = new URL(requestUrl);
    const timestamp = Math.floor(Date.now() / 1000).toString().padStart(10, '0');
    const nonce = this.generateRandomString(16);
    const host = url.hostname;
    const uri = url.pathname + url.search;
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    const other = '';

    // Build MAC signature base string
    const signatureBase = this.buildMacSignatureBase(timestamp, nonce, method, uri, host, port, other);

    // Sign with mac_key using HMAC-SHA1
    const hmac = cryptoJS.HmacSHA1(signatureBase, macToken.mac_key);
    const macSignature = cryptoJS.enc.Base64.stringify(hmac);

    return `MAC id="${macToken.kid}", ts="${timestamp}", nonce="${nonce}", mac="${macSignature}"`;
  }

  /**
   * Build MAC signature base string
   */
  private buildMacSignatureBase(
    time: string,
    nonce: string,
    method: string,
    uri: string,
    host: string,
    port: string,
    other: string
  ): string {
    let base = `${time}\n${nonce}\n${method}\n${uri}\n${host}\n${port}\n`;

    if (!other) {
      base += '\n';
    } else {
      base += `${other}\n`;
    }

    return base;
  }

  /**
   * Generate request signature for X-Tap-Sign header
   * Format: HMAC-SHA256(method + url + headers + body, signing_key)
   */
  private generateSignature(
    method: string,
    url: string,
    headers: Record<string, string>,
    body: string
  ): string {
    try {
      const methodPart = method;
      const urlPart = url;
      const headersPart = this.getHeadersPart(headers);
      const bodyPart = body;
      const signParts = `${methodPart}\n${urlPart}\n${headersPart}\n${bodyPart}\n`;

      const hmacResult = cryptoJS.HmacSHA256(signParts, this.config.signingKey);
      const signatureBase64 = cryptoJS.enc.Base64.stringify(hmacResult);

      return signatureBase64;
    } catch (error) {
      throw new Error(`Failed to generate signature: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get headers part for signature
   * Only includes X-Tap-* headers (excluding X-Tap-Sign)
   */
  private getHeadersPart(headers: Record<string, string>): string {
    const headerKeys: string[] = [];
    const headerValues: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      const k = key.toLowerCase();
      if (!k.startsWith('x-tap-') || k === 'x-tap-sign') {
        continue;
      }

      headerKeys.push(k);
      headerValues[k] = value;
    }

    headerKeys.sort();

    const formattedHeaders = headerKeys.map((k) => {
      return `${k}:${headerValues[k]}`;
    });

    return formattedHeaders.join('\n');
  }

  /**
   * Generate random string
   */
  private generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Get current environment
   */
  getEnvironment(): string {
    return this.config.environment;
  }

  /**
   * Get API base URL
   */
  getBaseUrl(): string {
    return this.config.apiBaseUrl;
  }
}
