/**
 * Maker login flow based on TapTap OAuth device code.
 */

import QRCode from 'qrcode';
import type { MacToken } from '../../core/types/index.js';
import { generateAuthUrl, pollForToken, requestDeviceCode } from '../../core/auth/oauth.js';
import { EnvConfig } from '../../core/utils/env.js';
import { exchangeTapTokenForMakerJwt } from './jwt.js';
import type { MakerTapAuth, MakerTapDeviceSession } from '../types.js';
import { loadTapDeviceSession, saveTapAuth, saveTapDeviceSession } from '../storage.js';

declare const __MAKER_VERSION__: string | undefined;

const BUILT_IN_MAKER_CLIENT_ID = 'm2dnabebip3fpardnm';
const MAKER_CLIENT_ID_ENV = 'TAPTAP_MAKER_CLIENT_ID';
const TAPTAP_CLIENT_ID_ENV = 'TAPTAP_MCP_CLIENT_ID';
const MAKER_VERSION = typeof __MAKER_VERSION__ !== 'undefined' ? __MAKER_VERSION__ : 'dev';

export async function startTapDeviceLogin(): Promise<MakerTapDeviceSession> {
  ensureMakerClientId();
  const environment = EnvConfig.environment;
  const deviceCode = await requestDeviceCode(environment);
  const authUrl = generateAuthUrl(deviceCode.qrcode_url, environment);
  const now = Date.now();
  const expiresIn = Number(deviceCode.expires_in || 120);
  const session: MakerTapDeviceSession = {
    device_code: deviceCode.device_code,
    qrcode_url: deviceCode.qrcode_url,
    auth_url: authUrl,
    environment,
    expires_at: new Date(now + expiresIn * 1000).toISOString(),
    interval_seconds: Number(deviceCode.interval || 3),
    raw: deviceCode,
  };

  saveTapDeviceSession(session);
  return session;
}

export async function completeTapDeviceLogin(options?: {
  deviceCode?: string;
  maxAttempts?: number;
}): Promise<MakerTapAuth> {
  const session = options?.deviceCode ? null : loadTapDeviceSession();
  const deviceCode = options?.deviceCode || session?.device_code;
  if (!deviceCode) {
    throw new Error('Tap device_code not found. Run `taptap-maker login` to complete Maker login.');
  }

  const environment = session?.environment || EnvConfig.environment;
  const intervalMs = (session?.interval_seconds || 3) * 1000;
  ensureMakerClientId();
  const tapToken = await pollForToken(deviceCode, environment, {
    intervalMs,
    maxAttempts: options?.maxAttempts || 20,
  });

  const auth: MakerTapAuth = {
    kid: tapToken.kid,
    mac_key: tapToken.mac_key,
    token_type: tapToken.token_type || 'mac',
    mac_algorithm: tapToken.mac_algorithm || 'hmac-sha-1',
    raw: tapToken,
  };
  saveTapAuth(auth);
  return auth;
}

export async function loginWithTapDeviceFlow(): Promise<string> {
  const deviceCode = await startTapDeviceLogin();
  const authUrl = deviceCode.auth_url;
  const qrText = await QRCode.toString(authUrl, { type: 'terminal', small: true });

  process.stderr.write('\n请使用 TapTap App 扫码或打开链接完成授权：\n\n');
  process.stderr.write(qrText);
  process.stderr.write(`\n${authUrl}\n\n`);

  const tapToken = await completeTapDeviceLogin({
    deviceCode: deviceCode.device_code,
    maxAttempts: 60,
  });
  const jwt = await exchangeTapTokenForMakerJwt(tapToken as MakerTapAuth & MacToken);

  return `✓ Logged in${jwt.user_name ? ` as ${jwt.user_name}` : ''}`;
}

export function resolveMakerClientIdFallback(options?: {
  environment?: 'production' | 'rnd';
  version?: string;
  makerClientId?: string;
}): string | undefined {
  const explicitMakerClientId = options?.makerClientId || process.env[MAKER_CLIENT_ID_ENV];
  if (explicitMakerClientId) {
    return explicitMakerClientId;
  }

  const environment = options?.environment || EnvConfig.environment;
  const version = options?.version || MAKER_VERSION;
  if (environment === 'rnd' || isBetaMakerPackage(version)) {
    return BUILT_IN_MAKER_CLIENT_ID;
  }

  return undefined;
}

export function ensureMakerClientId(): void {
  if (process.env[TAPTAP_CLIENT_ID_ENV]) {
    return;
  }

  const makerClientId = resolveMakerClientIdFallback();
  if (makerClientId) {
    process.env[TAPTAP_CLIENT_ID_ENV] = makerClientId;
  }
}

function isBetaMakerPackage(version: string): boolean {
  return /-beta(?:\.|$)/.test(version);
}
