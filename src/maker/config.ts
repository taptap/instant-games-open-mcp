/**
 * Maker environment endpoint configuration.
 */

import fs from 'node:fs';
import path from 'node:path';
import { EnvConfig } from '../core/utils/env.js';

export type MakerEnvironment = 'production' | 'rnd';

export interface MakerEndpoints {
  apiBase?: string;
  patUrl?: string;
  tapTokenUrl?: string;
  gitBase?: string;
  remoteMcpServerUrl?: string;
  webUrl?: string;
}

const MAKER_ENDPOINTS: Record<MakerEnvironment, MakerEndpoints> = {
  production: {
    webUrl: 'https://maker.taptap.cn',
    apiBase: 'https://maker.taptap.cn/api/v1',
    patUrl: 'https://maker.taptap.cn/api/v1/user/pat-tokens',
    tapTokenUrl: 'https://maker.taptap.cn/api/v1/user/taptap-token',
    gitBase: 'https://maker.taptap.cn/git',
    remoteMcpServerUrl: 'https://maker.taptap.cn/mcp/v1',
  },
  rnd: {
    webUrl: 'https://fuping.agnt.xd.com',
    apiBase: 'https://fuping.agnt.xd.com/api/v1',
    patUrl: 'https://fuping.agnt.xd.com/api/v1/user/pat-tokens',
    tapTokenUrl: 'https://fuping.agnt.xd.com/api/v1/user/taptap-token',
    gitBase: 'https://fuping.agnt.xd.com/git',
    remoteMcpServerUrl: 'https://fuping.agnt.xd.com/mcp/v1',
  },
};

const MAKER_PROJECT_ENV_CONFIG_FILE = path.join('.maker', 'taptap-maker.local.json');
let makerEnvironmentOverride: MakerEnvironment | undefined;

export const MAKER_ENV_OVERRIDES = {
  apiBase: {
    current: 'TAPTAP_MAKER_API_BASE',
    legacy: 'MAKER_API_BASE',
  },
  patUrl: {
    current: 'TAPTAP_MAKER_PAT_URL',
    legacy: 'MAKER_PAT_URL',
  },
  tapTokenUrl: {
    current: 'TAPTAP_MAKER_TAP_TOKEN_URL',
    legacy: 'MAKER_TAP_TOKEN_URL',
  },
  gitBase: {
    current: 'TAPTAP_MAKER_GIT_BASE',
    legacy: 'MAKER_GIT_BASE',
  },
  remoteMcpServerUrl: {
    current: 'TAPTAP_MAKER_REMOTE_MCP_SERVER_URL',
    legacy: 'TAPTAP_REMOTE_MCP_SERVER_URL',
  },
  webUrl: {
    current: 'TAPTAP_MAKER_WEB_URL',
    legacy: 'MAKER_WEB_URL',
  },
} as const;

export function setMakerEnvironmentOverride(environment: MakerEnvironment | undefined): void {
  makerEnvironmentOverride = environment;
}

export function getMakerEnvironment(
  environment?: 'production' | 'rnd',
  cwd = process.cwd()
): MakerEnvironment {
  if (environment) {
    return environment;
  }
  if (makerEnvironmentOverride) {
    return makerEnvironmentOverride;
  }

  const envValue = process.env.TAPTAP_MCP_ENV;
  if (envValue === 'rnd' || envValue === 'production') {
    return envValue;
  }

  return getProjectLocalEnvironment(cwd) || EnvConfig.environment;
}

export function getMakerEndpoints(environment?: 'production' | 'rnd'): MakerEndpoints {
  const env = getMakerEnvironment(environment);
  const endpoints = MAKER_ENDPOINTS[env] || {};
  return {
    apiBase: getOverride(MAKER_ENV_OVERRIDES.apiBase) || endpoints.apiBase,
    patUrl: getOverride(MAKER_ENV_OVERRIDES.patUrl) || endpoints.patUrl,
    tapTokenUrl: getOverride(MAKER_ENV_OVERRIDES.tapTokenUrl) || endpoints.tapTokenUrl,
    gitBase: getOverride(MAKER_ENV_OVERRIDES.gitBase) || endpoints.gitBase,
    remoteMcpServerUrl:
      getOverride(MAKER_ENV_OVERRIDES.remoteMcpServerUrl) || endpoints.remoteMcpServerUrl,
    webUrl: getOverride(MAKER_ENV_OVERRIDES.webUrl) || endpoints.webUrl,
  };
}

export function getMakerWebUrl(environment?: 'production' | 'rnd'): string {
  const endpoints = getMakerEndpoints(environment);
  return requireMakerEndpoint('webUrl', endpoints.webUrl, environment).replace(/\/$/, '');
}

export function getMakerApiBaseUrl(environment?: 'production' | 'rnd'): string {
  const endpoints = getMakerEndpoints(environment);
  return requireMakerEndpoint('apiBase', endpoints.apiBase, environment).replace(/\/$/, '');
}

export function getMakerProjectEnvironmentConfigPath(cwd = process.cwd()): string | undefined {
  let current = path.resolve(cwd);
  for (;;) {
    const candidate = path.join(current, MAKER_PROJECT_ENV_CONFIG_FILE);
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function requireMakerEndpoint(
  name: keyof MakerEndpoints,
  value: string | undefined,
  environment?: 'production' | 'rnd'
): string {
  if (!value) {
    const env = getMakerEnvironment(environment);
    const override = MAKER_ENV_OVERRIDES[name];
    throw new Error(
      [
        `Maker endpoint "${name}" is not configured for ${env}.`,
        'Update src/maker/config.ts for this environment,',
        `or override it with ${override.current}.`,
        `${override.legacy} is also accepted for backward compatibility.`,
      ].join(' ')
    );
  }
  return value;
}

function getOverride(envNames: { current: string; legacy: string }): string | undefined {
  return process.env[envNames.current] || process.env[envNames.legacy];
}

function getProjectLocalEnvironment(cwd: string): MakerEnvironment | undefined {
  const configPath = getMakerProjectEnvironmentConfigPath(cwd);
  if (!configPath) {
    return undefined;
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const data = JSON.parse(raw) as { env?: unknown; environment?: unknown };
    const env = data.env || data.environment;
    return env === 'rnd' || env === 'production' ? env : undefined;
  } catch {
    return undefined;
  }
}
