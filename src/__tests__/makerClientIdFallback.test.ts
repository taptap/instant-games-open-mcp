/**
 * Maker client_id fallback tests.
 */

import { ensureMakerClientId, resolveMakerClientIdFallback } from '../maker/auth/oauth';

describe('maker client id fallback', () => {
  const originalTapTapClientId = process.env.TAPTAP_MCP_CLIENT_ID;
  const originalMakerClientId = process.env.TAPTAP_MAKER_CLIENT_ID;
  const originalEnv = process.env.TAPTAP_MCP_ENV;

  afterEach(() => {
    restoreEnv('TAPTAP_MCP_CLIENT_ID', originalTapTapClientId);
    restoreEnv('TAPTAP_MAKER_CLIENT_ID', originalMakerClientId);
    restoreEnv('TAPTAP_MCP_ENV', originalEnv);
  });

  test('uses explicit Maker client id before built-in fallback', () => {
    expect(
      resolveMakerClientIdFallback({
        environment: 'rnd',
        makerClientId: 'maker-client-from-env',
      })
    ).toBe('maker-client-from-env');
  });

  test('uses built-in Maker client id in RND', () => {
    expect(resolveMakerClientIdFallback({ environment: 'rnd', version: '1.22.0' })).toBe(
      'm2dnabebip3fpardnm'
    );
  });

  test('uses built-in Maker client id for beta packages', () => {
    expect(
      resolveMakerClientIdFallback({ environment: 'production', version: '1.22.0-beta.2' })
    ).toBe('m2dnabebip3fpardnm');
  });

  test('does not use built-in Maker client id for stable production packages', () => {
    expect(
      resolveMakerClientIdFallback({ environment: 'production', version: '1.22.0' })
    ).toBeUndefined();
  });

  test('does not override an existing TapTap MCP client id', () => {
    process.env.TAPTAP_MCP_ENV = 'rnd';
    process.env.TAPTAP_MCP_CLIENT_ID = 'existing-client-id';
    delete process.env.TAPTAP_MAKER_CLIENT_ID;

    ensureMakerClientId();

    expect(process.env.TAPTAP_MCP_CLIENT_ID).toBe('existing-client-id');
  });

  test('sets TapTap MCP client id from built-in Maker fallback in RND', () => {
    process.env.TAPTAP_MCP_ENV = 'rnd';
    delete process.env.TAPTAP_MCP_CLIENT_ID;
    delete process.env.TAPTAP_MAKER_CLIENT_ID;

    ensureMakerClientId();

    expect(process.env.TAPTAP_MCP_CLIENT_ID).toBe('m2dnabebip3fpardnm');
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
