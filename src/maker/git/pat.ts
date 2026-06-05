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

const MAKER_PAT_ENV = 'MAKER_PAT';
const SHORT_PAT_ENV = 'PAT';

export function getManualMakerPat(manualPat?: string): MakerPat | null {
  const token = manualPat || process.env[MAKER_PAT_ENV] || process.env[SHORT_PAT_ENV];
  if (!token) {
    return null;
  }

  return {
    token,
  };
}

export function saveManualMakerPat(manualPat: string): MakerPat {
  const pat: MakerPat = {
    token: manualPat,
  };
  savePat(pat);
  return pat;
}

export function requireMakerPat(manualPat?: string): MakerPat {
  const manual = getManualMakerPat(manualPat);
  if (manual?.token) {
    if (manualPat) {
      savePat(manual);
    }
    return manual;
  }

  const cachedPat = loadPat();
  if (!cachedPat) {
    throw new Error(
      [
        'Maker PAT not found.',
        'Run `taptap-maker login` to complete Maker CLI login,',
        'or provide MAKER_PAT/PAT only for CI/emergency fallback.',
      ].join(' ')
    );
  }

  return cachedPat;
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
  pat?: string;
  name?: string;
  force?: boolean;
}): Promise<MakerPat> {
  const manualPat = getManualMakerPat(options?.pat);
  if (manualPat) {
    if (options?.pat) {
      savePat(manualPat);
    }
    return manualPat;
  }

  if (!options?.force) {
    const cachedPat = loadPat();
    if (cachedPat) {
      return cachedPat;
    }
  }

  const patUrl = getMakerPatUrl();
  let jwt;
  try {
    jwt = requireMakerJwt(options?.jwt);
  } catch {
    throw new Error(
      [
        'Maker PAT not found.',
        'Run `taptap-maker login` to complete Maker CLI login,',
        'or provide MAKER_PAT/PAT only for CI/emergency fallback.',
      ].join(' ')
    );
  }
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
