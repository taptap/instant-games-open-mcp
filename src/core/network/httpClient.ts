/**
 * HTTP Client for TapTap API Requests
 * Handles MAC authentication, request signing, headers, and error responses
 */

import process from 'node:process';
import cryptoJS from 'crypto-js';
import { MacToken } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { EnvConfig } from '../utils/env.js';
import { parseMacToken, isValidMacToken } from '../utils/macTokenValidator.js';
import { createAuthError, extractAuthErrorFromResponse } from '../errors/authErrors.js';
import {
  initSigner,
  getClientIdSync,
  computeTapSignSync,
  computeTapSignWithBuffer,
  isSignerAvailable,
  isUsingNativeSigner,
} from './nativeSigner.js';

/**
 * API 配置验证
 * 启动时验证签名器可用性（native 或 env fallback）
 * Token 管理已移至 tokenResolver（无全局状态）
 */
export class ApiConfig {
  private static instance: ApiConfig;
  private static initialized = false;

  private constructor() {
    // Constructor is sync, actual validation happens in initAsync
  }

  /**
   * 异步初始化（在服务器启动时调用）
   */
  public static async initAsync(): Promise<void> {
    if (ApiConfig.initialized) return;

    // 初始化 native signer
    await initSigner();

    // 检查签名器是否可用
    const available = await isSignerAvailable();

    if (!available) {
      process.stderr.write('❌ Signer not available!\n\n');
      process.stderr.write('Option 1 (Production): Use npm package with native signer\n');
      process.stderr.write('  npx @mikoto_zero/minigame-open-mcp\n\n');
      process.stderr.write('Option 2 (Development): Set environment variables\n');
      process.stderr.write('  export TAPTAP_MCP_CLIENT_ID="your_client_id"\n');
      process.stderr.write('  export TAPTAP_MCP_CLIENT_SECRET="your_signing_key"\n\n');
      process.exit(1);
    }

    // 显示签名器状态
    if (isUsingNativeSigner()) {
      process.stderr.write('✅ Using native signer (CLIENT_SECRET protected)\n');
    } else {
      process.stderr.write('ℹ️  Using environment variables (development mode)\n');
    }

    // MAC Token 验证（可选，如果提供则必须有效）
    const macTokenEnv = EnvConfig.macToken;
    const parsedToken = macTokenEnv ? parseMacToken(macTokenEnv, 'environment variable') : null;
    if (macTokenEnv && macTokenEnv.trim().length > 0 && !parsedToken) {
      process.stderr.write('⚠️  Warning: TAPTAP_MCP_MAC_TOKEN provided but failed to parse\n');
      process.stderr.write('   The token will be ignored and OAuth flow will be used instead.\n\n');
    }

    ApiConfig.initialized = true;
  }

  public static getInstance(): ApiConfig {
    if (!ApiConfig.instance) {
      ApiConfig.instance = new ApiConfig();
    }
    return ApiConfig.instance;
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
  private ctx?: import('../types/context.js').ResolvedContext;

  /**
   * @param ctx - ResolvedContext (用于 token 解析和用户标识)
   */
  constructor(ctx?: import('../types/context.js').ResolvedContext) {
    this.ctx = ctx;
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
  private async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    // 从 nativeSigner 获取 clientId（native 或 env fallback）
    const apiBaseUrl = EnvConfig.endpoints.apiBaseUrl;
    const clientId = getClientIdSync();

    // Build full URL with query parameters
    let fullUrl = `${apiBaseUrl}${path}`;
    let signUrl = new URL(fullUrl).pathname;

    // Add client_id to query params
    const queryParams = new URLSearchParams();
    queryParams.append('client_id', clientId);

    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        queryParams.append(key, value);
      });
    }

    fullUrl += '?' + queryParams.toString();
    signUrl += '?' + queryParams.toString();

    // Prepare request body
    let bodyString = '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (options.body !== undefined) {
      if (headers['Content-Type'] === 'application/x-www-form-urlencoded') {
        // Form-encoded body
        const formData = new URLSearchParams();
        // Handle null/undefined in form data safely
        if (options.body && typeof options.body === 'object') {
          Object.entries(options.body as Record<string, unknown>).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              formData.append(key, String(value));
            }
          });
        }
        bodyString = formData.toString();
      } else {
        // JSON body
        // Use JSON.stringify for all values except undefined (which is handled by outer if)
        bodyString = JSON.stringify(options.body);
      }
    } else if (method === 'POST' || method === 'PUT') {
      // 修复: 某些服务端框架（如 Gin）在处理 JSON Binding 时
      // 如果 Content-Type 是 application/json 但 body 为空，会抛出 EOF 错误
      // 所以对于 POST/PUT 请求，如果没有 body，应该发送空对象 '{}'
      bodyString = '{}';
    }

    // ✅ 直接使用 ResolvedContext 解析 token
    const effectiveMacToken = this.ctx?.resolveToken() || null;

    // Generate MAC Authorization header
    const authorization = this.generateMacAuthorization(fullUrl, method, effectiveMacToken);
    headers['Authorization'] = authorization;

    // Add timestamp and nonce headers
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = this.generateRandomString(8);
    headers['X-Tap-Ts'] = timestamp;
    headers['X-Tap-Nonce'] = nonce;

    // Calculate signature using native signer or env fallback
    const headersPart = this.getHeadersPart(headers);
    const signature = computeTapSignSync(method, signUrl, headersPart, bodyString);
    headers['X-Tap-Sign'] = signature;

    // Log request
    await logger.logRequest(method, fullUrl, headers, bodyString);

    // Set up timeout
    const controller = new AbortController();
    const timeout = options.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(fullUrl, {
        method,
        headers,
        body: bodyString || undefined,
        signal: controller.signal,
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
          const errorData = (await response.json()) as any;
          errorBody = errorData;
          errorMessage += ` - ${errorData.message || errorData.error || JSON.stringify(errorData)}`;

          // 使用统一的认证错误提取
          const authError = extractAuthErrorFromResponse(response, errorData);
          if (authError) {
            // Log auth error
            await logger.logResponse(
              method,
              fullUrl,
              response.status,
              response.statusText,
              errorBody,
              false,
              responseHeaders
            );
            throw authError;
          }
        } else {
          const errorText = await response.text();
          errorBody = errorText;
          errorMessage += ` - ${errorText}`;

          // 使用统一的认证错误提取 (含文本检测)
          const authError = extractAuthErrorFromResponse(response, null, errorText);
          if (authError) {
            await logger.logResponse(
              method,
              fullUrl,
              response.status,
              response.statusText,
              errorBody,
              false,
              responseHeaders
            );
            throw authError;
          }
        }

        // Log error
        await logger.logResponse(
          method,
          fullUrl,
          response.status,
          response.statusText,
          errorBody,
          false,
          responseHeaders
        );

        // 创建通用的HTTP错误
        throw new Error(errorMessage);
      }

      // Parse response
      const contentType = response.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        const jsonData = (await response.json()) as ApiResponse<T>;

        // Log successful response with headers
        await logger.logResponse(
          method,
          fullUrl,
          response.status,
          response.statusText,
          jsonData,
          true,
          responseHeaders
        );

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
      await logger.logResponse(
        method,
        fullUrl,
        response.status,
        response.statusText,
        text,
        true,
        responseHeaders
      );

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
   * 改进的MAC授权生成，增加更好的错误提示
   */
  private generateMacAuthorization(url: string, method: string, token: MacToken | null): string {
    if (!token || !isValidMacToken(token)) {
      throw createAuthError('TOKEN_MISSING', '无法生成MAC授权头：缺少有效的MAC Token', {
        retryAvailable: true,
      });
    }

    const urlObj = new URL(url);
    const timestamp = Math.floor(Date.now() / 1000)
      .toString()
      .padStart(10, '0');
    const nonce = this.generateRandomString(16);
    const host = urlObj.hostname;
    const uri = urlObj.pathname + urlObj.search;
    const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
    const other = '';

    // Build MAC signature base string
    const signatureBase = this.buildMacSignatureBase(
      timestamp,
      nonce,
      method,
      uri,
      host,
      port,
      other
    );

    // Sign with mac_key using HMAC-SHA1
    const hmac = cryptoJS.HmacSHA1(signatureBase, token.mac_key);

    // Debug: Check HMAC result
    if (!hmac || hmac.sigBytes === undefined) {
      throw new Error('HMAC-SHA1 returned undefined or invalid result for MAC authorization');
    }

    const macSignature = cryptoJS.enc.Base64.stringify(hmac);

    return `MAC id="${token.kid}", ts="${timestamp}", nonce="${nonce}", mac="${macSignature}"`;
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
   * Multipart form field definition
   */
  private buildMultipartBody(
    fields: Array<{
      name: string;
      value: Buffer | string;
      filename?: string;
      contentType?: string;
    }>
  ): { boundary: string; buffer: Buffer } {
    const boundary = '----TapTapMCP' + this.generateRandomString(16);
    const bodyParts: Buffer[] = [];

    for (const field of fields) {
      // Add boundary
      bodyParts.push(Buffer.from(`--${boundary}\r\n`));

      // Add Content-Disposition header
      if (field.filename) {
        bodyParts.push(
          Buffer.from(
            `Content-Disposition: form-data; name="${field.name}"; filename="${field.filename}"\r\n`
          )
        );
        // Add Content-Type for file
        const contentType = field.contentType || 'application/octet-stream';
        bodyParts.push(Buffer.from(`Content-Type: ${contentType}\r\n`));
      } else {
        bodyParts.push(Buffer.from(`Content-Disposition: form-data; name="${field.name}"\r\n`));
      }

      // Empty line before content
      bodyParts.push(Buffer.from('\r\n'));

      // Add field value
      if (Buffer.isBuffer(field.value)) {
        bodyParts.push(field.value);
      } else {
        bodyParts.push(Buffer.from(field.value));
      }

      // End of field
      bodyParts.push(Buffer.from('\r\n'));
    }

    // Add closing boundary
    bodyParts.push(Buffer.from(`--${boundary}--\r\n`));

    return {
      boundary,
      buffer: Buffer.concat(bodyParts),
    };
  }

  /**
   * POST with multipart/form-data (for file uploads)
   * Manually constructs the multipart body to enable proper signature calculation
   * @param path - API endpoint path
   * @param fields - Array of form fields with name, value, filename, and contentType
   * @param options - Request options
   * @returns Response data
   */
  async postMultipart<T>(
    path: string,
    fields: Array<{
      name: string;
      value: Buffer | string;
      filename?: string;
      contentType?: string;
    }>,
    options: Omit<RequestOptions, 'body' | 'headers'> = {}
  ): Promise<T> {
    const method = 'POST';
    const baseUrl = EnvConfig.endpoints.apiBaseUrl;
    let fullUrl = `${baseUrl}${path}`;
    let signUrl = path;

    // Get client_id from signer
    const clientId = getClientIdSync();

    // Add client_id to query params
    const queryParams = new URLSearchParams();
    queryParams.append('client_id', clientId);

    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        queryParams.append(key, value);
      });
    }

    fullUrl += '?' + queryParams.toString();
    signUrl += '?' + queryParams.toString();

    // Build multipart body
    const { boundary, buffer: bodyBuffer } = this.buildMultipartBody(fields);

    // Set headers
    const headers: Record<string, string> = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': bodyBuffer.length.toString(),
    };

    // Get MAC token
    const effectiveMacToken = this.ctx?.resolveToken() || null;

    // Generate MAC Authorization header
    const authorization = this.generateMacAuthorization(fullUrl, method, effectiveMacToken);
    headers['Authorization'] = authorization;

    // Add timestamp and nonce headers
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = this.generateRandomString(8);
    headers['X-Tap-Ts'] = timestamp;
    headers['X-Tap-Nonce'] = nonce;

    // Calculate signature with Buffer body (for correct binary handling)
    const headersPart = this.getHeadersPart(headers);
    const signature = computeTapSignWithBuffer(method, signUrl, headersPart, bodyBuffer);
    headers['X-Tap-Sign'] = signature;

    // Log request
    await logger.logRequest(
      method,
      fullUrl,
      headers,
      `[multipart/form-data, ${fields.length} field(s), ${bodyBuffer.length} bytes]`
    );

    // Set up timeout
    const controller = new AbortController();
    const timeout = options.timeout || 60000; // Longer timeout for uploads
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(fullUrl, {
        method,
        headers,
        body: bodyBuffer,
        signal: controller.signal,
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
          const errorData = (await response.json()) as any;
          errorBody = errorData;
          errorMessage += ` - ${errorData.message || errorData.error || JSON.stringify(errorData)}`;

          const authError = extractAuthErrorFromResponse(response, errorData);
          if (authError) {
            await logger.logResponse(
              method,
              fullUrl,
              response.status,
              response.statusText,
              errorBody,
              false,
              responseHeaders
            );
            throw authError;
          }
        } else {
          const errorText = await response.text();
          errorBody = errorText;
          errorMessage += ` - ${errorText}`;
        }

        await logger.logResponse(
          method,
          fullUrl,
          response.status,
          response.statusText,
          errorBody,
          false,
          responseHeaders
        );

        throw new Error(errorMessage);
      }

      // Parse response
      const contentType = response.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        const jsonData = (await response.json()) as ApiResponse<T>;

        await logger.logResponse(
          method,
          fullUrl,
          response.status,
          response.statusText,
          jsonData,
          true,
          responseHeaders
        );

        if (jsonData.success === false) {
          throw new Error(jsonData.message || jsonData.error || 'API request failed');
        }

        return (jsonData.data !== undefined ? jsonData.data : jsonData) as T;
      }

      const text = await response.text();
      await logger.logResponse(
        method,
        fullUrl,
        response.status,
        response.statusText,
        text,
        true,
        responseHeaders
      );

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
}
