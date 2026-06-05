/**
 * Maker CLI login based on a temporary authorization code.
 */

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import type { MakerEnvironment } from '../config.js';
import { getMakerApiBaseUrl, getMakerEnvironment, getMakerWebUrl } from '../config.js';
import { DEFAULT_SHORT_FETCH_TIMEOUT_MS, fetchWithTimeout } from '../fetchTimeout.js';
import type { MakerPat } from '../types.js';

export interface MakerCliLoginResult extends MakerPat {
  code: string;
  auth_url: string;
}

export interface MakerCliLoginOptions {
  env?: MakerEnvironment;
  timeoutMs?: number;
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
  openBrowser?: boolean;
  onStatus?: (message: string) => void;
  fetchImpl?: typeof fetch;
}

type MakerCliLoginPollResponse = {
  status?: string;
  pat?: string;
  token?: string;
  access_token?: string;
  expires_at?: string;
  data?: {
    status?: string;
    pat?: string;
    token?: string;
    access_token?: string;
    expires_at?: string;
  };
};

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 1000;

export function createCliLoginCode(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function getMakerCliLoginUrl(code: string, env?: MakerEnvironment): string {
  const url = new URL('/pat-tokens', getMakerWebUrl(env));
  url.searchParams.set('code', code);
  return url.toString();
}

export function getMakerCliLoginResultUrl(code: string, env?: MakerEnvironment): string {
  const url = new URL('cli-auth/result', `${getMakerApiBaseUrl(env)}/`);
  url.searchParams.set('code', code);
  return url.toString();
}

export async function loginWithCliAuthCode(
  options: MakerCliLoginOptions = {}
): Promise<MakerCliLoginResult> {
  const env = options.env || getMakerEnvironment();
  const code = createCliLoginCode();
  const authUrl = getMakerCliLoginUrl(code, env);
  options.onStatus?.(
    `Opening Maker PAT page: ${authUrl}\n请在页面登录并点击“创建 token”，CLI 会继续等待授权结果。`
  );

  if (options.openBrowser !== false) {
    openBrowser(authUrl);
  }

  const pat = await pollCliLoginResult(code, {
    ...options,
    env,
  });
  return {
    ...pat,
    code,
    auth_url: authUrl,
  };
}

async function pollCliLoginResult(
  code: string,
  options: MakerCliLoginOptions & { env: MakerEnvironment }
): Promise<MakerPat> {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_SHORT_FETCH_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  const resultUrl = getMakerCliLoginResultUrl(code, options.env);
  let lastPollError: unknown;

  for (;;) {
    if (Date.now() >= deadline) {
      const suffix = lastPollError ? ` Last polling error: ${formatError(lastPollError)}` : '';
      throw new Error(
        `Maker CLI login timed out. Run \`taptap-maker login\` and try again.${suffix}`
      );
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(
        fetchImpl,
        resultUrl,
        {
          headers: {
            Accept: 'application/json',
          },
        },
        Math.min(requestTimeoutMs, Math.max(1, deadline - Date.now())),
        'Maker CLI login poll'
      );
    } catch (error) {
      lastPollError = error;
      await delay(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
      continue;
    }

    const json = (await readJsonResponse(response)) as MakerCliLoginPollResponse;
    if (!response.ok) {
      throw new Error(
        `Maker CLI login poll failed: HTTP ${response.status} ${JSON.stringify(json)}`
      );
    }

    const normalized = normalizePollResponse(json);
    if (normalized.status === 'authorized') {
      if (!normalized.token) {
        throw new Error('Maker CLI login result does not contain PAT token.');
      }
      return {
        token: normalized.token,
        expires_at: normalized.expires_at,
        raw: json,
      };
    }

    if (normalized.status === 'expired' || normalized.status === 'consumed') {
      throw new Error(`Maker CLI login ${normalized.status}. Run \`taptap-maker login\` again.`);
    }

    await delay(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())));
  }
}

function normalizePollResponse(data: MakerCliLoginPollResponse): {
  status: string;
  token?: string;
  expires_at?: string;
} {
  const source = data.data || data;
  const token = source.pat || source.token || source.access_token;
  return {
    status: source.status || data.status || (token ? 'authorized' : 'pending'),
    token,
    expires_at: source.expires_at,
  };
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text };
  }
}

function openBrowser(url: string): void {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const result = spawnSync(command, args, {
    stdio: 'ignore',
    windowsHide: true,
  });
  if (result.error || result.status !== 0) {
    process.stderr.write(
      `Open this Maker PAT URL in your browser, then log in and click "创建 token":\n${url}\n`
    );
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
