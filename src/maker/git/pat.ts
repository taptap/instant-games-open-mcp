/**
 * Maker PAT helpers for project git operations.
 */

import type { MakerPat } from '../types.js';
import { loadPat, savePat } from '../storage.js';
import { requireMakerJwt } from '../auth/jwt.js';

const PAT_URL_ENV = 'MAKER_PAT_URL';
const DEFAULT_PAT_URL = 'https://fuping.agnt.xd.com/api/v1/user/pat-tokens';

function normalizePatResponse(data: unknown): MakerPat {
  const body = data as Record<string, unknown>;
  const token =
    body.token ||
    body.pat ||
    body.access_token ||
    (body.data && typeof body.data === 'object'
      ? (body.data as Record<string, unknown>).token ||
        (body.data as Record<string, unknown>).pat ||
        (body.data as Record<string, unknown>).access_token
      : undefined);

  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Maker PAT response does not contain token/pat/access_token');
  }

  return {
    token,
    expires_at: typeof body.expires_at === 'string' ? body.expires_at : undefined,
    raw: data,
  };
}

export function getMakerPatUrl(): string {
  return process.env[PAT_URL_ENV] || DEFAULT_PAT_URL;
}

export async function requestMakerPat(options?: {
  jwt?: string;
  name?: string;
  force?: boolean;
}): Promise<MakerPat> {
  if (!options?.force) {
    const cachedPat = loadPat();
    if (cachedPat) {
      return cachedPat;
    }
  }

  const patUrl = getMakerPatUrl();
  const jwt = requireMakerJwt(options?.jwt);
  const response = await fetch(patUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: options?.name || 'first-pat',
    }),
  });

  const json = (await response.json()) as unknown;
  if (!response.ok) {
    throw new Error(`Maker PAT request failed: HTTP ${response.status} ${JSON.stringify(json)}`);
  }

  const pat = normalizePatResponse(json);
  savePat(pat);
  return pat;
}
