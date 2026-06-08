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
      custom_fields: {
        session_id: 'client-session-1',
        team: 'studio-a',
      },
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
    expect(JSON.parse(headers['X-TapTap-Custom-Fields'])).toEqual({
      session_id: 'client-session-1',
      team: 'studio-a',
    });
  });

  test('also injects tag as a per-call private argument', () => {
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
      _custom_fields: {
        session_id: 'client-session-1',
        team: 'studio-a',
      },
    });
  });

  test('treats tag and custom fields as private parameters on the server side', () => {
    const args = {
      page: 1,
      _tag: 'local',
      _project_id: 'project-1',
      _custom_fields: {
        session_id: 'client-session-1',
      },
    };

    expect(extractPrivateParams(args)).toMatchObject({
      _tag: 'local',
      _project_id: 'project-1',
      _custom_fields: {
        session_id: 'client-session-1',
      },
    });
    expect(hasPrivateParams(args)).toBe(true);
    expect(stripPrivateParams(args)).toEqual({ page: 1 });
    expect(
      mergePrivateParams({ page: 2 }, { _tag: 'local', _custom_fields: { session_id: 'client-2' } })
    ).toEqual({
      page: 2,
      _tag: 'local',
      _custom_fields: { session_id: 'client-2' },
    });
    const context = new ResolvedContext(extractPrivateParams(args), {
      customFields: { session_id: 'header-client-session' },
      tag: 'header',
    });

    expect(context.tag).toBe('local');
    expect(context.customFields?.session_id).toBe('client-session-1');
  });

  test('falls back to session headers when no private custom fields are provided', () => {
    const context = new ResolvedContext(
      {},
      {
        customFields: { session_id: 'header-client-session' },
        tag: 'local',
      }
    );

    expect(context.tag).toBe('local');
    expect(context.customFields?.session_id).toBe('header-client-session');
  });
});

describe('mcp proxy exposed tools allowlist', () => {
  test('filters listed tools to the configured proxy allowlist', () => {
    const proxy = new TapTapMCPProxy({
      ...createProxyConfig(),
      options: {
        exposed_tools: [
          'generate_image',
          'batch_generate_images',
          'edit_image',
          'create_video_task',
          'text_to_music',
        ],
      },
    });

    const filtered = (
      proxy as unknown as {
        filterListedTools<T extends { tools: Array<{ name: string }> }>(result: T): T;
      }
    ).filterListedTools({
      tools: [
        { name: 'generate_image' },
        { name: 'batch_generate_images' },
        { name: 'edit_image' },
        { name: 'create_video_task' },
        { name: 'text_to_music' },
        { name: 'list_developers_and_apps' },
      ],
    });

    expect(filtered.tools.map((tool) => tool.name)).toEqual([
      'generate_image',
      'batch_generate_images',
      'edit_image',
      'create_video_task',
      'text_to_music',
    ]);
  });

  test('rejects calls to tools hidden by the configured allowlist', () => {
    const proxy = new TapTapMCPProxy({
      ...createProxyConfig(),
      options: {
        exposed_tools: [
          'generate_image',
          'batch_generate_images',
          'edit_image',
          'create_video_task',
          'text_to_music',
        ],
      },
    });

    const proxyInternals = proxy as unknown as {
      assertToolExposed(name: string): void;
    };

    expect(() => proxyInternals.assertToolExposed('generate_image')).not.toThrow();
    expect(() => proxyInternals.assertToolExposed('create_video_task')).not.toThrow();
    expect(() => proxyInternals.assertToolExposed('text_to_music')).not.toThrow();
    expect(() => proxyInternals.assertToolExposed('list_developers_and_apps')).toThrow(
      'Tool is not exposed by this proxy: list_developers_and_apps'
    );
  });
});
