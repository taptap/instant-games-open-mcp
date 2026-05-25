/**
 * Maker JWT exchange and storage.
 */

import type { MacToken } from '../../core/types/index.js';
import type { MakerJwt, MakerTapAuth } from '../types.js';
import { loadJwt, loadTapAuth, saveJwt } from '../storage.js';
import { getMakerWebUrl } from '../config.js';

const JWT_EXCHANGE_ENV = 'MAKER_JWT_EXCHANGE_URL';
const MAKER_JWT_ENV = 'MAKER_JWT';
const SHORT_JWT_ENV = 'JWT';

function normalizeJwtResponse(data: unknown): MakerJwt {
  const body = data as Record<string, unknown>;
  const token =
    body.token ||
    body.jwt ||
    body.access_token ||
    (body.data && typeof body.data === 'object'
      ? (body.data as Record<string, unknown>).token ||
        (body.data as Record<string, unknown>).jwt ||
        (body.data as Record<string, unknown>).access_token
      : undefined);

  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Maker JWT exchange response does not contain token/jwt/access_token');
  }

  return {
    token,
    token_type: typeof body.token_type === 'string' ? body.token_type : 'Bearer',
    expires_at: typeof body.expires_at === 'string' ? body.expires_at : undefined,
    user_id: typeof body.user_id === 'string' ? body.user_id : undefined,
    user_name: typeof body.user_name === 'string' ? body.user_name : undefined,
    raw: data,
  };
}

export function decodeMakerJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length !== 3) {
    throw new Error('Maker JWT should contain 3 segments.');
  }

  const payload = parts[1] + '='.repeat((4 - (parts[1].length % 4)) % 4);
  const decoded = Buffer.from(payload, 'base64url').toString('utf8');
  const data = JSON.parse(decoded) as unknown;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Maker JWT payload is not an object.');
  }
  return data as Record<string, unknown>;
}

export function getUserIdFromMakerJwt(jwt: MakerJwt): string | undefined {
  if (jwt.user_id) {
    return jwt.user_id;
  }

  try {
    const payload = decodeMakerJwtPayload(jwt.token);
    const userId = payload.userId || payload.user_id || payload.sub;
    return typeof userId === 'string' && userId.length > 0 ? userId : undefined;
  } catch {
    return undefined;
  }
}

export function getMakerJwtExchangeUrl(): string | undefined {
  return process.env[JWT_EXCHANGE_ENV];
}

export function formatBrowserJwtGuide(): string {
  const makerWebUrl = getMakerWebUrl();
  return [
    '请让用户从 Maker 网页复制当前 JWT：',
    `1. 在 Chrome 打开 ${makerWebUrl} 并确认已登录。`,
    '2. 打开开发者工具，进入 Application -> Local storage。',
    '3. 找到 `taptap_access_token` 并拿到它的 value 给我。',
    '拿到 value 后，可将它作为 legacy JWT 传给仍支持 jwt 参数的 Maker 内部流程。',
    '',
    `MCP 会把 JWT 保存到本地 ${process.env.TAPTAP_MAKER_HOME || '~/.taptap-maker'}/jwt.json。`,
  ].join('\n');
}

export function getManualMakerJwt(manualJwt?: string): MakerJwt | null {
  const token = manualJwt || process.env[MAKER_JWT_ENV] || process.env[SHORT_JWT_ENV];
  if (!token) {
    return null;
  }

  return {
    token,
    token_type: 'Bearer',
  };
}

export function saveManualMakerJwt(manualJwt: string): MakerJwt {
  let userId: string | undefined;
  try {
    const payload = decodeMakerJwtPayload(manualJwt);
    const candidate = payload.userId || payload.user_id || payload.sub;
    userId = typeof candidate === 'string' ? candidate : undefined;
  } catch {
    userId = undefined;
  }

  const jwt: MakerJwt = {
    token: manualJwt,
    token_type: 'Bearer',
    user_id: userId,
  };
  saveJwt(jwt);
  return jwt;
}

export async function exchangeTapTokenForMakerJwt(tapToken: MacToken): Promise<MakerJwt> {
  const exchangeUrl = getMakerJwtExchangeUrl();
  if (!exchangeUrl) {
    throw new Error(
      `${JWT_EXCHANGE_ENV} is not configured. Maker Server JWT exchange is still required.`
    );
  }

  const response = await fetch(exchangeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tap_token: tapToken,
    }),
  });

  const json = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(`Maker JWT exchange failed: HTTP ${response.status} ${JSON.stringify(json)}`);
  }

  const jwt = normalizeJwtResponse(json);
  saveJwt(jwt);
  return jwt;
}

export async function exchangeSavedTapAuthForMakerJwt(options?: {
  manualJwt?: string;
}): Promise<MakerJwt> {
  const exchangeUrl = getMakerJwtExchangeUrl();
  const tapAuth = loadTapAuth();

  if (exchangeUrl && tapAuth) {
    return exchangeTapTokenForMakerJwt(tapAuth as MakerTapAuth & MacToken);
  }

  const manualJwt = getManualMakerJwt(options?.manualJwt);
  if (manualJwt?.token) {
    const saved = saveManualMakerJwt(manualJwt.token);
    return saved;
  }

  const cachedJwt = loadJwt();
  if (cachedJwt) {
    return cachedJwt;
  }

  if (!exchangeUrl) {
    throw new Error(
      [
        `${JWT_EXCHANGE_ENV} is not configured. Provide manual_jwt for now.`,
        '',
        formatBrowserJwtGuide(),
      ].join('\n')
    );
  }

  throw new Error(
    'Tap auth not found. Run `taptap-maker pat set <PAT>` with a valid Maker PAT first.'
  );
}

export function requireMakerJwt(manualJwt?: string): MakerJwt {
  const jwt = getManualMakerJwt(manualJwt) || loadJwt();
  if (!jwt) {
    throw new Error(['Maker JWT not found.', '', formatBrowserJwtGuide()].join('\n'));
  }
  return jwt;
}
