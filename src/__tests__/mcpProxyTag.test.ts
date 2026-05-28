import { TapTapMCPProxy } from '../mcp-proxy/proxy';
import {
  extractPrivateParams,
  hasPrivateParams,
  mergePrivateParams,
  stripPrivateParams,
} from '../core/types/privateParams';
import type { ProxyConfig } from '../mcp-proxy/types';
import { ResolvedContext } from '../core/types/context';

function createProxyConfig(): ProxyConfig {
  return {
    server: {
      url: 'https://mcp.example.test',
      env: 'rnd',
    },
    tenant: {
      user_id: 'user-1',
      project_id: 'project-1',
      project_path: 'project-1/workspace',
    },
    auth: {
      kid: 'kid-1',
      mac_key: 'mac-key-1',
      token_type: 'mac',
      mac_algorithm: 'hmac-sha-1',
    },
    options: {
      verbose: false,
    },
  };
}

describe('mcp proxy tag private parameter', () => {
  test('injects _tag local into proxied tool call arguments', () => {
    const proxy = new TapTapMCPProxy(createProxyConfig());

    const injected = (
      proxy as unknown as {
        injectPrivateParams(args: Record<string, unknown>): Record<string, unknown>;
      }
    ).injectPrivateParams({ name: 'demo' });

    expect(injected).toMatchObject({
      name: 'demo',
      _tag: 'local',
      _project_id: 'project-1',
      _project_path: 'project-1/workspace',
      _user_id: 'user-1',
    });
  });

  test('treats _tag as a private parameter on the server side', () => {
    const args = {
      page: 1,
      _tag: 'local',
      _project_id: 'project-1',
    };

    expect(extractPrivateParams(args)).toMatchObject({
      _tag: 'local',
      _project_id: 'project-1',
    });
    expect(hasPrivateParams(args)).toBe(true);
    expect(stripPrivateParams(args)).toEqual({ page: 1 });
    expect(mergePrivateParams({ page: 2 }, { _tag: 'local' })).toEqual({
      page: 2,
      _tag: 'local',
    });
    expect(new ResolvedContext(extractPrivateParams(args)).tag).toBe('local');
  });
});
