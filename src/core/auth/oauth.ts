/**
 * OAuth 2.0 Device Code Flow 实现
 * 职责：处理 OAuth 网络请求
 */

import { getOAuthEndpoints, getClientId } from './config.js';
import type { MacToken } from '../types/index.js';

/**
 * Device Code Response
 */
export interface DeviceCodeData {
  device_code: string;
  qrcode_url: string;
  expires_in?: number;
  interval?: number;
}

/**
 * Poll options
 */
export interface PollOptions {
  maxAttempts?: number;
  intervalMs?: number;
}

/**
 * 请求 device code
 */
export async function requestDeviceCode(environment: string = 'production'): Promise<DeviceCodeData> {
  const endpoints = getOAuthEndpoints(environment);
  const clientId = getClientId();
  const url = `https://${endpoints.authHost}/oauth2/v1/device/code`;
  
  const params = new URLSearchParams({
    client_id: clientId,
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
    return json.data as DeviceCodeData;
  }
  
  throw new Error(`Failed to get device code: ${json.data?.msg || 'Unknown error'}`);
}

/**
 * 生成授权 URL
 */
export function generateAuthUrl(qrcodeUrl: string, environment: string = 'production'): string {
  const endpoints = getOAuthEndpoints(environment);
  return endpoints.qrcodeBaseUrl + encodeURIComponent(qrcodeUrl);
}

/**
 * 轮询获取 token
 */
export async function pollForToken(
  deviceCode: string,
  environment: string = 'production',
  options?: PollOptions
): Promise<MacToken> {
  const endpoints = getOAuthEndpoints(environment);
  const clientId = getClientId();
  const url = `https://${endpoints.authHost}/oauth2/v1/token`;
  const maxAttempts = options?.maxAttempts || 60;
  const intervalMs = options?.intervalMs || 2000;
  
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    
    const params = new URLSearchParams({
      grant_type: 'device_token',
      client_id: clientId,
      secret_type: 'hmac-sha-1',
      code: deviceCode
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
      
      // 成功获取 token
      if (json.success === true && json.data) {
        return {
          kid: json.data.kid,
          mac_key: json.data.mac_key,
          token_type: json.data.token_type || 'mac',
          mac_algorithm: json.data.mac_algorithm || 'hmac-sha-1'
        } as MacToken;
      }
      
      // 检查错误类型
      const error = json.data?.error;
      
      if (error === 'authorization_pending' || error === 'authorization_waiting') {
        // 继续等待
        if (attempts % 5 === 0) {
          const elapsed = attempts * (intervalMs / 1000);
          process.stderr.write(`⏳ 等待授权中... (${elapsed}秒)\n`);
        }
        continue;
      }
      
      // 其他错误
      if (error === 'expired_token') {
        throw new Error('❌ 授权码已过期，请重新获取授权链接');
      }
      
      if (error === 'access_denied') {
        throw new Error('❌ 用户拒绝授权');
      }
      
      throw new Error(`❌ 授权失败: ${json.data?.error_description || error || 'Unknown error'}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('❌')) {
        throw error;
      }
      // 网络错误，继续轮询
      continue;
    }
  }
  
  throw new Error('⏰ 授权超时（2分钟），请重新获取授权链接');
}

