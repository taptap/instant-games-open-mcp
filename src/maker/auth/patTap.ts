/**
 * Maker PAT to TapTap MAC token exchange.
 */

import type { MakerTapAuth } from '../types.js';
import { getMakerEndpoints, requireMakerEndpoint } from '../config.js';
import { DEFAULT_SHORT_FETCH_TIMEOUT_MS, fetchWithTimeout } from '../fetchTimeout.js';
import { saveTapAuth } from '../storage.js';
import { requireMakerPat } from '../git/pat.js';
import type { MakerEnvironment } from '../config.js';

function getObjectValue(data: unknown, key: string): unknown {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  return (data as Record<string, unknown>)[key];
}

function normalizeTapAuthResponse(data: unknown): MakerTapAuth {
  const body = data as Record<string, unknown>;
  const nested = getObjectValue(body, 'data');
  const source = nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : body;
  const kid = source.kid;
  const macKey = source.mac_key;

  if (
    typeof kid !== 'string' ||
    kid.length === 0 ||
    typeof macKey !== 'string' ||
    macKey.length === 0
  ) {
    throw new Error('TapTap token response does not contain kid/mac_key');
  }

  return {
    kid,
    mac_key: macKey,
    token_type: typeof source.token_type === 'string' ? source.token_type : 'mac',
    mac_algorithm: typeof source.mac_algorithm === 'string' ? source.mac_algorithm : 'hmac-sha-1',
    raw: data,
  };
}

export function getMakerTapTokenUrl(environment?: MakerEnvironment): string {
  const tapTokenUrl = getMakerEndpoints(environment).tapTokenUrl;
  return requireMakerEndpoint('tapTokenUrl', tapTokenUrl, environment);
}

export async function requestTapAuthWithPat(
  manualPat?: string,
  environment?: MakerEnvironment,
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {}
): Promise<MakerTapAuth> {
  const pat = requireMakerPat(manualPat);
  const response = await fetchWithTimeout(
    options.fetchImpl || fetch,
    getMakerTapTokenUrl(environment),
    {
      headers: {
        Authorization: `Bearer ${pat.token}`,
        Accept: 'application/json',
      },
    },
    options.timeoutMs ?? DEFAULT_SHORT_FETCH_TIMEOUT_MS,
    'TapTap token request'
  );

  const text = await response.text();
  let json: unknown = {};
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = { error: text };
    }
  }

  if (!response.ok) {
    throw new Error(`TapTap token request failed: HTTP ${response.status} ${JSON.stringify(json)}`);
  }

  const auth = normalizeTapAuthResponse(json);
  saveTapAuth(auth, environment);
  return auth;
}
