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

  public readonly macToken: MacToken;
  public readonly clientId: string;
  public readonly clientSecret: string;
  public readonly apiBaseUrl: string;
  public readonly environment: 'rnd' | 'production';

  private constructor() {
    // Required environment variables
    const macTokenStr = process.env.TAPTAP_MAC_TOKEN || '';
    this.clientId = process.env.TAPTAP_CLIENT_ID || '';
    this.clientSecret = process.env.TAPTAP_CLIENT_SECRET || '';

    // Parse MAC Token from JSON string
    try {
      this.macToken = macTokenStr ? JSON.parse(macTokenStr) : {} as MacToken;
    } catch (error) {
      process.stderr.write('❌ Failed to parse TAPTAP_MAC_TOKEN: Invalid JSON format\n');
      process.exit(1);
    }

    // Optional: default to production
    this.environment = (process.env.TAPTAP_ENV === 'rnd') ? 'rnd' : 'production';

    // Set API base URL based on environment
    this.apiBaseUrl = this.environment === 'production'
      ? 'https://agent.tapapis.cn'
      : 'https://agent.api.xdrnd.cn';

    // Validate required environment variables
    this.validateConfig();
  }

  private validateConfig(): void {
    const missing: string[] = [];

    if (!this.macToken.kid || !this.macToken.mac_key) {
      missing.push('TAPTAP_MAC_TOKEN (must be valid JSON with kid and mac_key)');
    }

    if (!this.clientId) {
      missing.push('TAPTAP_CLIENT_ID');
    }

    if (!this.clientSecret) {
      missing.push('TAPTAP_CLIENT_SECRET');
    }

    if (missing.length > 0) {
      process.stderr.write(`❌ Missing required environment variables: ${missing.join(', ')}\n`);
      process.stderr.write('\nExample TAPTAP_MAC_TOKEN format:\n');
      process.stderr.write('{"kid":"abc123","token_type":"mac","mac_key":"secret_key","mac_algorithm":"hmac-sha-1"}\n');
      process.exit(1);
    }
  }

  public static getInstance(): ApiConfig {
    if (!ApiConfig.instance) {
      ApiConfig.instance = new ApiConfig();
    }
    return ApiConfig.instance;
  }

  public isConfigured(): boolean {
    return !!(this.macToken.kid && this.macToken.mac_key && this.clientId && this.clientSecret);
  }

  public getConfigStatus(): Record<string, string> {
    return {
      'TAPTAP_MAC_TOKEN': this.macToken.kid ? `✅ 已配置 (kid: ${this.macToken.kid.substring(0, 8)}...)` : '❌ 未配置',
      'TAPTAP_CLIENT_ID': this.clientId ? '✅ 已配置' : '❌ 未配置',
      'TAPTAP_CLIENT_SECRET': this.clientSecret ? '✅ 已配置' : '❌ 未配置',
      'TAPTAP_ENV': `${this.environment} (${this.apiBaseUrl})`,
    };
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

  constructor() {
    this.config = ApiConfig.getInstance();
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

    // Generate MAC Authorization header
    const authorization = this.generateMacAuthorization(fullUrl, method);
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
    logger.logRequest(method, fullUrl, headers, bodyString);

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

      // Handle non-OK responses
      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        let errorBody: any = null;

        if (contentType?.includes('application/json')) {
          const errorData = await response.json() as any;
          errorBody = errorData;
          errorMessage += ` - ${errorData.message || errorData.error || JSON.stringify(errorData)}`;
        } else {
          const errorText = await response.text();
          errorBody = errorText;
          errorMessage += ` - ${errorText}`;
        }

        // Log error response
        logger.logResponse(method, fullUrl, response.status, response.statusText, errorBody, false);

        throw new Error(errorMessage);
      }

      // Parse response
      const contentType = response.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        const jsonData = await response.json() as ApiResponse<T>;

        // Log successful response
        logger.logResponse(method, fullUrl, response.status, response.statusText, jsonData, true);

        // Handle API response format
        if (jsonData.success === false) {
          throw new Error(jsonData.message || jsonData.error || 'API request failed');
        }

        // Return data field if available, otherwise return full response
        return (jsonData.data !== undefined ? jsonData.data : jsonData) as T;
      }

      // If not JSON, return text
      const text = await response.text();

      // Log text response
      logger.logResponse(method, fullUrl, response.status, response.statusText, text, true);

      return text as T;

    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          const timeoutError = new Error(`Request timeout after ${timeout}ms`);
          logger.error(`HTTP Request timeout: ${method} ${fullUrl}`, timeoutError);
          throw timeoutError;
        }
        logger.error(`HTTP Request failed: ${method} ${fullUrl}`, error);
        throw error;
      }

      const genericError = new Error(`Request failed: ${String(error)}`);
      logger.error(`HTTP Request failed: ${method} ${fullUrl}`, genericError);
      throw genericError;
    }
  }

  /**
   * Generate MAC Authorization header
   * Format: MAC id="kid", ts="timestamp", nonce="random", mac="signature"
   */
  private generateMacAuthorization(requestUrl: string, method: string): string {
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
    const hmac = cryptoJS.HmacSHA1(signatureBase, this.config.macToken.mac_key);
    const macSignature = cryptoJS.enc.Base64.stringify(hmac);

    return `MAC id="${this.config.macToken.kid}", ts="${timestamp}", nonce="${nonce}", mac="${macSignature}"`;
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
   * Format: HMAC-SHA256(method + url + headers + body, CLIENT_SECRET)
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

      const hmacResult = cryptoJS.HmacSHA256(signParts, this.config.clientSecret);
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
