/**
 * Maker PAT helpers for project git operations.
 */

import type { MakerPat } from '../types.js';
import { loadPat, savePat } from '../storage.js';
import { requireMakerJwt } from '../auth/jwt.js';
import { getMakerEndpoints, requireMakerEndpoint } from '../config.js';

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

export function getConfiguredMakerPatUrl(): string | undefined {
  return getMakerEndpoints().patUrl;
}

export function getMakerPatUrl(): string {
  const patUrl = getConfiguredMakerPatUrl();
  return requireMakerEndpoint('patUrl', patUrl);
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
