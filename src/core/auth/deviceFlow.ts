/**
 * OAuth 2.0 Device Code Flow Authentication
 * Based on tapcode-mcp-h5 implementation
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { MacToken } from '../types/index.js';

/**
 * Environment-specific host configuration
 */
interface HostConfig {
  apiHost: string;
  authHost: string;
  qrcodeBaseUrl: string;
  clientId: string;
}

const ENV_CONFIGS: Record<string, HostConfig> = {
  production: {
    apiHost: 'agent.tapapis.cn',
    authHost: 'accounts.tapapis.cn',
    qrcodeBaseUrl: 'https://www.taptap.cn/tap-qrcode?scene=mcp_auth&code=',
    clientId: 'cadxxoz247zw0ug5i2'
  },
  rnd: {
    apiHost: 'agent.api.xdrnd.cn',
    authHost: 'oauth.api.xdrnd.cn',
    qrcodeBaseUrl: 'https://www-beta.xdrnd.cn/tap-qrcode?scene=mcp_auth&code=',
    clientId: 'm2dnabebip3fpardnm'
  }
};

/**
 * Device Code Response
 */
interface DeviceCodeResponse {
  device_code: string;
  qrcode_url: string;
  expires_in?: number;
  interval?: number;
}

/**
 * Token Response
 */
interface TokenResponse {
  kid: string;
  mac_key: string;
  token_type: string;
  mac_algorithm: string;
}

/**
 * Progress callback for authorization polling
 */
export interface AuthProgressCallback {
  (info: {
    type: 'auth_url' | 'polling' | 'success' | 'timeout' | 'error';
    message: string;
    authUrl?: string;
    elapsed?: number;
    remaining?: number;
  }): void | Promise<void>;
}

/**
 * Device Code Flow Authentication Manager
 */
export class DeviceFlowAuth {
  private deviceCode: string = '';
  private macToken: MacToken | undefined;
  private tokenPath: string;
  private config: HostConfig;

  constructor(environment: string = 'production') {
    const home = os.homedir();
    this.tokenPath = path.join(home, '.config', 'taptap-minigame', 'token.json');
    this.config = ENV_CONFIGS[environment] || ENV_CONFIGS.production;
  }

  /**
   * Try to load existing token (without starting auth flow)
   * Priority: env var > local file
   * Returns null if no token found
   */
  tryLoadToken(): MacToken | null {
    // 1. Check environment variable (highest priority)
    if (process.env.TDS_MCP_MAC_TOKEN) {
      try {
        const token = JSON.parse(process.env.TDS_MCP_MAC_TOKEN) as MacToken;
        if (token.kid && token.mac_key) {
          this.macToken = token;
          process.stderr.write('✅ Loaded MAC Token from environment variable\n');
          return this.macToken;
        }
      } catch (error) {
        process.stderr.write('⚠️  Invalid TDS_MCP_MAC_TOKEN format in environment\n');
      }
    }

    // 2. Check local file
    if (fs.existsSync(this.tokenPath)) {
      try {
        const content = fs.readFileSync(this.tokenPath, 'utf8');
        const token = JSON.parse(content) as MacToken;

        // Simple validation
        if (token.kid && token.mac_key) {
          this.macToken = token;
          process.stderr.write(`✅ Loaded MAC Token from: ${this.tokenPath}\n`);
          return this.macToken;
        }
      } catch (error) {
        process.stderr.write(`⚠️  Invalid token file: ${this.tokenPath}\n`);
      }
    }

    return null;
  }

  /**
   * Initialize authentication
   * Priority: env var > local file > device flow
   */
  async initialize(): Promise<MacToken> {
    // Try to load existing token first
    const existingToken = this.tryLoadToken();
    if (existingToken) {
      return existingToken;
    }

    // No token found - generate auth URL and throw immediately (non-blocking!)
    process.stderr.write('\n🔐 No valid authentication found, generating authorization URL...\n\n');

    // Get device code
    const deviceCodeData = await this.requestDeviceCode();

    // Generate authorization URL
    const authUrl = this.config.qrcodeBaseUrl + encodeURIComponent(deviceCodeData.qrcode_url);

    // Output to stderr for terminal users
    process.stderr.write(`🔗 授权链接: ${authUrl}\n\n`);

    // Throw error with URL (for MCP clients like Claude Code)
    throw new Error(
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔐 TapTap 授权登录\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `请在浏览器中打开以下链接完成授权：\n\n` +
      `🔗 ${authUrl}\n\n` +
      `授权步骤：\n` +
      `1. 点击或复制上面的链接\n` +
      `2. 在浏览器中打开\n` +
      `3. 使用 TapTap App 扫描二维码\n` +
      `4. 授权成功后，重新执行此操作\n\n` +
      `💾 Token 将自动保存到: ${this.tokenPath}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    );
  }

  /**
   * Get device code (exposed for SSE mode)
   */
  async getDeviceCode() {
    return await this.requestDeviceCode();
  }

  /**
   * Get QR code URL (exposed for SSE mode)
   */
  getQrcodeUrl(deviceUrl: string): string {
    return this.config.qrcodeBaseUrl + encodeURIComponent(deviceUrl);
  }

  /**
   * Start background polling (for SSE mode)
   */
  async startBackgroundPolling(deviceCode: string): Promise<MacToken> {
    this.deviceCode = deviceCode;
    const macToken = await this.pollForToken();
    this.saveToken(macToken);
    this.macToken = macToken;
    return macToken;
  }

  /**
   * Get authorization URL (for manual auth flow)
   */
  async getAuthorizationUrl(): Promise<string> {
    const deviceCodeData = await this.requestDeviceCode();
    const authUrl = this.config.qrcodeBaseUrl + encodeURIComponent(deviceCodeData.qrcode_url);
    return authUrl;
  }

  /**
   * Start Device Code Flow (blocking version for terminal use)
   */
  private async startDeviceFlow(): Promise<MacToken> {
    // Step 1: Get device code
    const deviceCodeData = await this.requestDeviceCode();

    // Step 2: Show QR code to user
    this.displayAuthorizationInfo(deviceCodeData);

    // Step 3: Poll for token
    this.macToken = await this.pollForToken();

    // Step 4: Save to local file
    this.saveToken(this.macToken);

    process.stderr.write('\n✅ 授权成功！Token 已保存\n');
    process.stderr.write(`📁 Token 位置: ${this.tokenPath}\n\n`);

    return this.macToken;
  }

  /**
   * Request device code from OAuth server
   */
  private async requestDeviceCode(): Promise<DeviceCodeResponse> {
    const url = `https://${this.config.authHost}/oauth2/v1/device/code`;

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'device_code',
      scope: 'public_profile'
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    if (!response.ok) {
      throw new Error(`Failed to get device code: ${response.status} ${response.statusText}`);
    }

    const json = await response.json() as any;

    if (json.success === true && json.data) {
      this.deviceCode = json.data.device_code;
      return json.data as DeviceCodeResponse;
    }

    throw new Error(`Failed to get device code: ${json.data?.msg || 'Unknown error'}`);
  }

  /**
   * Display authorization information to user
   */
  private displayAuthorizationInfo(data: DeviceCodeResponse): void {
    const qrcodeUrl = this.config.qrcodeBaseUrl + encodeURIComponent(data.qrcode_url);

    process.stderr.write('━'.repeat(80) + '\n');
    process.stderr.write('🔐 TapTap 授权登录\n');
    process.stderr.write('━'.repeat(80) + '\n\n');
    process.stderr.write('请使用以下方式之一完成授权：\n\n');
    process.stderr.write('方式 1: 使用 TapTap App 扫描二维码\n');
    process.stderr.write(`   访问: ${qrcodeUrl}\n\n`);
    process.stderr.write('方式 2: 在浏览器中打开上述链接\n\n');
    process.stderr.write('━'.repeat(80) + '\n');
    process.stderr.write('⏳ 等待授权中...\n');
    process.stderr.write('━'.repeat(80) + '\n\n');
  }

  /**
   * Poll for access token with progress callback
   */
  private async pollForToken(onProgress?: AuthProgressCallback): Promise<MacToken> {
    const url = `https://${this.config.authHost}/oauth2/v1/token`;
    let attempts = 0;
    const maxAttempts = 60; // 最多等待 2 分钟（60 * 2s）

    while (attempts < maxAttempts) {
      attempts++;

      // Wait before polling
      await new Promise(resolve => setTimeout(resolve, 2000));

      const params = new URLSearchParams({
        grant_type: 'device_token',
        client_id: this.config.clientId,
        secret_type: 'hmac-sha-1',
        code: this.deviceCode
      });

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params
        });

        const json = await response.json() as any;

        if (json.success === true && json.data) {
          // Authorization successful
          this.deviceCode = '';

          if (onProgress) {
            await onProgress({
              type: 'success',
              message: '✅ 授权成功！Token 已保存'
            });
          }

          return {
            kid: json.data.kid,
            mac_key: json.data.mac_key,
            token_type: json.data.token_type || 'mac',
            mac_algorithm: json.data.mac_algorithm || 'hmac-sha-1'
          } as MacToken;
        }

        // Check error type
        const error = json.data?.error;
        if (error === 'authorization_pending' || error === 'authorization_waiting') {
          // Still waiting for user authorization
          const elapsed = attempts * 2;
          const remaining = (maxAttempts - attempts) * 2;

          if (attempts % 5 === 0) {
            process.stderr.write(`⏳ 仍在等待授权... (${elapsed}秒)\n`);

            if (onProgress) {
              await onProgress({
                type: 'polling',
                message: `⏳ 等待授权中... 已等待 ${elapsed} 秒，剩余 ${remaining} 秒超时`,
                elapsed,
                remaining
              });
            }
          }
          continue;
        }

        // Other errors
        if (error === 'expired_token') {
          const errorMsg = '❌ 授权码已过期，请重新调用工具获取新的授权链接';
          if (onProgress) {
            await onProgress({
              type: 'error',
              message: errorMsg
            });
          }
          throw new Error(errorMsg);
        }

        if (error === 'access_denied') {
          const errorMsg = '❌ 用户拒绝授权';
          if (onProgress) {
            await onProgress({
              type: 'error',
              message: errorMsg
            });
          }
          throw new Error(errorMsg);
        }

        const errorMsg = `❌ 授权失败: ${json.data?.error_description || error || 'Unknown error'}`;
        if (onProgress) {
          await onProgress({
            type: 'error',
            message: errorMsg
          });
        }
        throw new Error(errorMsg);
      } catch (error) {
        if (error instanceof Error && error.message.includes('❌')) {
          throw error;
        }
        // Network error, continue polling
        continue;
      }
    }

    const timeoutMsg = '⏰ 授权超时（2分钟）。请重新调用工具获取新的授权链接。';
    if (onProgress) {
      await onProgress({
        type: 'timeout',
        message: timeoutMsg
      });
    }
    throw new Error(timeoutMsg);
  }

  /**
   * Save token to local file
   */
  private saveToken(token: MacToken): void {
    try {
      const dir = path.dirname(this.tokenPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tokenData = {
        ...token,
        saved_at: new Date().toISOString(),
        environment: this.config.apiHost
      };

      fs.writeFileSync(this.tokenPath, JSON.stringify(tokenData, null, 2), 'utf8');
    } catch (error) {
      process.stderr.write(`⚠️  Failed to save token: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  /**
   * Start auto authorization with progress callback
   * For SSE mode: polls for authorization and reports progress
   */
  async startAutoAuthorization(onProgress?: AuthProgressCallback): Promise<MacToken> {
    process.stderr.write(`[DEBUG] 🚀 startAutoAuthorization called, onProgress=${onProgress ? 'provided' : 'null'}\n`);

    // Get device code
    const deviceCodeData = await this.requestDeviceCode();
    const authUrl = this.config.qrcodeBaseUrl + encodeURIComponent(deviceCodeData.qrcode_url);

    process.stderr.write(`[DEBUG] 🔑 Device code generated, authUrl=${authUrl}\n`);

    // Send authorization URL to client
    if (onProgress) {
      process.stderr.write(`[DEBUG] 📤 Calling onProgress with auth_url...\n`);
      await onProgress({
        type: 'auth_url',
        message: '🔐 需要 TapTap 授权。请在浏览器中打开以下链接完成授权：',
        authUrl
      });
      process.stderr.write(`[DEBUG] ✅ onProgress auth_url callback completed\n`);
    } else {
      process.stderr.write(`[DEBUG] ⚠️  onProgress is null, skipping callback\n`);
    }

    // Output to stderr for terminal users
    process.stderr.write(`\n🔗 授权链接: ${authUrl}\n`);
    process.stderr.write('⏳ 自动等待授权中...\n\n');

    // Poll for token with progress
    this.macToken = await this.pollForToken(onProgress);

    // Save to local file
    this.saveToken(this.macToken);

    process.stderr.write('\n✅ 授权成功！Token 已保存\n');
    process.stderr.write(`📁 Token 位置: ${this.tokenPath}\n\n`);

    // Clear device code
    this.deviceCode = '';

    return this.macToken;
  }

  /**
   * Complete authorization by polling for token
   * Call this after user has completed authorization in browser
   */
  async completeAuthorization(): Promise<MacToken> {
    if (!this.deviceCode) {
      throw new Error('No pending authorization. Please call a tool that requires authentication first to get the authorization URL.');
    }

    process.stderr.write('⏳ Polling for authorization result...\n');

    // Poll for token (with timeout)
    this.macToken = await this.pollForToken();

    // Save to local file
    this.saveToken(this.macToken);

    process.stderr.write('\n✅ 授权成功！Token 已保存\n');
    process.stderr.write(`📁 Token 位置: ${this.tokenPath}\n\n`);

    // Clear device code
    this.deviceCode = '';

    return this.macToken;
  }

  /**
   * Get current MAC token
   */
  getToken(): MacToken | undefined {
    return this.macToken;
  }

  /**
   * Clear stored token (logout)
   */
  clearToken(): void {
    this.macToken = undefined;

    if (fs.existsSync(this.tokenPath)) {
      try {
        fs.unlinkSync(this.tokenPath);
        process.stderr.write(`✅ Token cleared: ${this.tokenPath}\n`);
      } catch (error) {
        process.stderr.write(`⚠️  Failed to clear token: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
  }
}
