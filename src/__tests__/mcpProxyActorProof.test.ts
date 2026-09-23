import { TapTapMCPProxy } from '../mcp-proxy/proxy';
import { validateConfig } from '../mcp-proxy/config';
import type { ProxyConfig } from '../mcp-proxy/types';

const PROOF = 'header.signature-not-logged';

function macConfig(): ProxyConfig {
  return {
    server: { url: 'https://mcp.example.test', env: 'rnd' },
    tenant: { user_id: 'user-1', project_id: 'project-1', project_path: 'project-1/workspace' },
    auth: {
      kid: 'kid-1',
      mac_key: 'mac-key-1',
      token_type: 'mac',
      mac_algorithm: 'hmac-sha-1',
    },
  };
}

function proofConfig(): ProxyConfig {
  return {
    server: { url: 'https://mcp.example.test', env: 'rnd' },
    tenant: { project_id: 'project-1', project_path: 'project-1/workspace' },
    auth: { mcp_proof: PROOF, token_type: 'mcp-proof' },
  };
}

describe('mcp proxy actor proof config', () => {
  test('accepts mcp_proof without kid or mac_key', () => {
    expect(() => validateConfig(proofConfig())).not.toThrow();
    expect(() => new TapTapMCPProxy(proofConfig())).not.toThrow();
  });

  test('still requires kid and mac_key for MAC config', () => {
    const config = macConfig();
    delete config.auth.mac_key;
    expect(() => validateConfig(config)).toThrow(/auth\.mac_key/);
  });

  test('rejects proof config that still claims token_type mac', () => {
    const config = proofConfig();
    config.auth.token_type = 'mac';
    expect(() => validateConfig(config)).toThrow(/mcp-proof/);
  });

  test('treats a blank proof as MAC and keeps the old requirements', () => {
    const config = macConfig();
    config.auth.mcp_proof = '   ';
    delete config.auth.kid;
    expect(() => validateConfig(config)).toThrow(/auth\.kid/);
  });
});

describe('mcp proxy actor proof injection', () => {
  test('sends the proof header and does not send an empty MAC token', () => {
    const proxy = new TapTapMCPProxy(proofConfig());
    const headers = (proxy as unknown as { buildSessionHeaders(): Record<string, string> }).buildSessionHeaders();
    expect(headers['X-Tapcode-Mcp-Proof']).toBe(PROOF);
    expect(headers['X-TapTap-Mac-Token']).toBeUndefined();
    const injected = (proxy as unknown as {
      injectPrivateParams(args?: Record<string, unknown>): Record<string, unknown>;
    }).injectPrivateParams({ name: 'build' });
    expect(injected._mcp_proof).toBe(PROOF);
    expect(injected).not.toHaveProperty('_mac_token');
    expect(injected._project_id).toBe('project-1');
  });

  test('keeps MAC header and _mac_token when no proof is configured', () => {
    const proxy = new TapTapMCPProxy(macConfig());
    const headers = (proxy as unknown as { buildSessionHeaders(): Record<string, string> }).buildSessionHeaders();
    expect(JSON.parse(headers['X-TapTap-Mac-Token'])).toMatchObject({ kid: 'kid-1', mac_key: 'mac-key-1' });
    expect(headers['X-Tapcode-Mcp-Proof']).toBeUndefined();
    const injected = (proxy as any).injectPrivateParams({ name: 'build' });
    expect(injected._mac_token).toMatchObject({ mac_key: 'mac-key-1' });
    expect(injected).not.toHaveProperty('_mcp_proof');
  });

  test('startup identity log does not include the proof', () => {
    const proxy = new TapTapMCPProxy(proofConfig()) as any;
    const lines: string[] = [];
    proxy.logWriter = { writeSync: (_level: string, message: string) => lines.push(message) };
    proxy.logAuthIdentity();
    expect(lines.join('\n')).toContain('Auth: mcp-proof');
    expect(lines.join('\n')).not.toContain(PROOF);
  });
});
