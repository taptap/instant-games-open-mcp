/**
 * Maker environment endpoint configuration.
 */

import { EnvConfig } from '../core/utils/env.js';

export type MakerEnvironment = 'production' | 'rnd';

export interface MakerEndpoints {
  apiBase?: string;
  patUrl?: string;
  gitBase?: string;
  remoteMcpServerUrl?: string;
}

const MAKER_ENDPOINTS: Record<MakerEnvironment, MakerEndpoints> = {
  production: {},
  rnd: {
    apiBase: 'https://fuping.agnt.xd.com/api/v1',
    patUrl: 'https://fuping.agnt.xd.com/api/v1/user/pat-tokens',
    gitBase: 'https://fuping.agnt.xd.com/git',
    remoteMcpServerUrl: 'http://172.25.135.95:4000',
  },
};

export const MAKER_ENV_OVERRIDES = {
  apiBase: {
    current: 'TAPTAP_MAKER_API_BASE',
    legacy: 'MAKER_API_BASE',
  },
  patUrl: {
    current: 'TAPTAP_MAKER_PAT_URL',
    legacy: 'MAKER_PAT_URL',
  },
  gitBase: {
    current: 'TAPTAP_MAKER_GIT_BASE',
    legacy: 'MAKER_GIT_BASE',
  },
  remoteMcpServerUrl: {
    current: 'TAPTAP_MAKER_REMOTE_MCP_SERVER_URL',
    legacy: 'TAPTAP_REMOTE_MCP_SERVER_URL',
  },
} as const;

export function getMakerEnvironment(environment?: 'production' | 'rnd'): MakerEnvironment {
  return environment || EnvConfig.environment;
}

export function getMakerEndpoints(environment?: 'production' | 'rnd'): MakerEndpoints {
  const env = getMakerEnvironment(environment);
  const endpoints = MAKER_ENDPOINTS[env] || {};
  return {
    apiBase: getOverride(MAKER_ENV_OVERRIDES.apiBase) || endpoints.apiBase,
    patUrl: getOverride(MAKER_ENV_OVERRIDES.patUrl) || endpoints.patUrl,
    gitBase: getOverride(MAKER_ENV_OVERRIDES.gitBase) || endpoints.gitBase,
    remoteMcpServerUrl:
      getOverride(MAKER_ENV_OVERRIDES.remoteMcpServerUrl) || endpoints.remoteMcpServerUrl,
  };
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
