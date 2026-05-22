/**
 * Maker PAT to TapTap token exchange tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { requestTapAuthWithPat } from '../maker/auth/patTap';
import { getTapAuthPath, loadTapAuth } from '../maker/storage';

describe('maker PAT TapTap token exchange', () => {
  const originalFetch = global.fetch;
  const originalMakerHome = process.env.TAPTAP_MAKER_HOME;
  const originalPat = process.env.PAT;
  const originalMakerPat = process.env.MAKER_PAT;
  const originalTapTokenUrl = process.env.TAPTAP_MAKER_TAP_TOKEN_URL;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-pat-tap-auth-'));
    process.env.TAPTAP_MAKER_HOME = tempDir;
    process.env.PAT = 'tmpct_test_pat';
    delete process.env.MAKER_PAT;
    process.env.TAPTAP_MAKER_TAP_TOKEN_URL = 'https://maker.example.test/api/v1/user/taptap-token';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    restoreEnv('TAPTAP_MAKER_HOME', originalMakerHome);
    restoreEnv('PAT', originalPat);
    restoreEnv('MAKER_PAT', originalMakerPat);
    restoreEnv('TAPTAP_MAKER_TAP_TOKEN_URL', originalTapTokenUrl);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('fetches TapTap token with Maker PAT and saves MAC auth', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          kid: 'tap-kid',
          mac_key: 'tap-mac-key',
          mac_algorithm: 'hmac-sha-1',
        }),
    } as Response);

    const auth = await requestTapAuthWithPat();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://maker.example.test/api/v1/user/taptap-token',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer tmpct_test_pat',
          Accept: 'application/json',
        }),
      })
    );
    expect(auth).toMatchObject({
      kid: 'tap-kid',
      mac_key: 'tap-mac-key',
      token_type: 'mac',
      mac_algorithm: 'hmac-sha-1',
    });
    expect(loadTapAuth()).toMatchObject(auth);
    expect(fs.existsSync(getTapAuthPath())).toBe(true);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
