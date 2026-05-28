import { TapTapMCPProxy } from '../mcp-proxy/proxy';
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
  test('sends local tag as an upstream session header', () => {
    const proxy = new TapTapMCPProxy(createProxyConfig());

    const headers = (
      proxy as unknown as {
        buildSessionHeaders(): Record<string, string>;
      }
    ).buildSessionHeaders();

    expect(headers).toMatchObject({
      'X-TapTap-Tag': 'local',
      'X-TapTap-Project-Id': 'project-1',
      'X-TapTap-Project-Path': 'project-1/workspace',
      'X-TapTap-User-Id': 'user-1',
    });
  });

  test('does not inject tag as a per-call private argument', () => {
    const proxy = new TapTapMCPProxy(createProxyConfig());

    const injected = (
      proxy as unknown as {
        injectPrivateParams(args: Record<string, unknown>): Record<string, unknown>;
      }
    ).injectPrivateParams({ name: 'demo' });

    expect(injected).not.toHaveProperty('_tag');
  });

  test('exposes session header tag through resolved context', () => {
    const context = new ResolvedContext({}, { tag: 'local' });

    expect(context.tag).toBe('local');
  });
});
