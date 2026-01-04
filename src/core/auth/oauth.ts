/**
 * OAuth 2.0 Device Code Flow 实现
 * 职责：处理 OAuth 网络请求
 */

import { EnvConfig } from '../utils/env.js';
import { getClientId } from '../network/nativeSigner.js';
import { logger } from '../utils/logger.js';
import type { MacToken } from '../types/index.js';
import QRCode from 'qrcode';

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
export async function requestDeviceCode(
  environment: string = 'production'
): Promise<DeviceCodeData> {
  const endpoints = EnvConfig.getEndpoints(environment);

  // 从 native signer 或环境变量获取 Client ID
  const clientId = await getClientId();

  const url = `https://${endpoints.authHost}/oauth2/v1/device/code`;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'device_code',
    scope: 'public_profile',
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  // 记录请求日志
  await logger.logRequest('POST', url, headers, params.toString());

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: params,
  });

  const json = (await response.json()) as any;

  // 提取响应头
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  // 记录响应日志
  await logger.logResponse(
    'POST',
    url,
    response.status,
    response.statusText,
    json,
    response.ok,
    responseHeaders
  );

  if (!response.ok) {
    // 尝试从响应体获取详细错误信息
    const errorMsg = json?.data?.msg || json?.error_description || json?.error || json?.message;
    throw new Error(
      `Failed to get device code: ${response.status} ${response.statusText}` +
        (errorMsg ? ` - ${errorMsg}` : '') +
        (json ? ` | Response: ${JSON.stringify(json)}` : '')
    );
  }

  if (json.success === true && json.data) {
    return json.data as DeviceCodeData;
  }

  throw new Error(`Failed to get device code: ${json.data?.msg || 'Unknown error'}`);
}

/**
 * 生成授权 URL
 */
export function generateAuthUrl(qrcodeUrl: string, environment: string = 'production'): string {
  const endpoints = EnvConfig.getEndpoints(environment);
  return endpoints.qrcodeBaseUrl + encodeURIComponent(qrcodeUrl);
}

/**
 * 生成 base64 编码的二维码图片
 * 参考 qrcode-mcp 的实现方式
 */
export async function generateQRCodeBase64(
  text: string,
  options?: {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  }
): Promise<string> {
  try {
    if (!text || text.trim().length === 0) {
      return '';
    }

    // 默认选项，参考 qrcode-mcp 的设置
    const defaultOptions = {
      width: 256, // 默认大小，参考 qrcode-mcp
      margin: 4, // 默认边距，参考 qrcode-mcp
      errorCorrectionLevel: 'M' as const,
    };

    // 合并用户选项和默认选项
    const qrOptions = {
      type: 'image/png' as const,
      errorCorrectionLevel: options?.errorCorrectionLevel || defaultOptions.errorCorrectionLevel,
      width: options?.width || defaultOptions.width,
      margin: options?.margin !== undefined ? options.margin : defaultOptions.margin,
    };

    // 生成 PNG 格式的二维码，转换为 base64
    const dataUrl = await QRCode.toDataURL(text, qrOptions);

    // dataUrl 格式: "data:image/png;base64,iVBORw0KG..."
    // 提取 base64 部分（去掉 data:image/png;base64, 前缀）
    const base64 = dataUrl.split(',')[1];

    if (!base64 || base64.length === 0) {
      return '';
    }

    return base64;
  } catch (error) {
    return '';
  }
}

/**
 * 轮询获取 token
 */
export async function pollForToken(
  deviceCode: string,
  environment: string = 'production',
  options?: PollOptions
): Promise<MacToken> {
  const endpoints = EnvConfig.getEndpoints(environment);

  // 从 native signer 或环境变量获取 Client ID
  const clientId = await getClientId();

  const url = `https://${endpoints.authHost}/oauth2/v1/token`;
  const maxAttempts = options?.maxAttempts || 60;
  const intervalMs = options?.intervalMs || 2000;

  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    const params = new URLSearchParams({
      grant_type: 'device_token',
      client_id: clientId,
      secret_type: 'hmac-sha-1',
      code: deviceCode,
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
      });

      const json = (await response.json()) as any;

      // 成功获取 token
      if (json.success === true && json.data) {
        return {
          kid: json.data.kid,
          mac_key: json.data.mac_key,
          token_type: json.data.token_type || 'mac',
          mac_algorithm: json.data.mac_algorithm || 'hmac-sha-1',
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
