/**
 * taptap-maker login/logout commands.
 */

import { loginWithTapDeviceFlow } from '../auth/oauth.js';
import { saveManualMakerJwt } from '../auth/jwt.js';
import { clearJwt, clearPat, clearTapAuth, clearTapDeviceSession } from '../storage.js';
import { getMakerWebUrl } from '../config.js';
import { getStringFlag } from './common.js';

export async function runLogin(flags: Record<string, string | boolean> = {}): Promise<void> {
  const manualJwt = getStringFlag(flags, 'jwt');
  if (manualJwt) {
    saveManualMakerJwt(manualJwt);
    process.stdout.write('✓ Saved Maker JWT from --jwt to ~/.taptap-maker/jwt.json\n');
    return;
  }

  const makerWebUrl = getMakerWebUrl();
  process.stderr.write(
    [
      'No --jwt was provided. Legacy Tap OAuth device flow will be used.',
      'Current recommended JWT flow:',
      `1. Open ${makerWebUrl} in Chrome and sign in.`,
      '2. Open DevTools -> Application -> Local storage.',
      '3. Find `taptap_access_token` and give me its value.',
      '4. Run `taptap-maker login --jwt <taptap_access_token>`.',
      '',
    ].join('\n')
  );
  const message = await loginWithTapDeviceFlow();
  process.stdout.write(`${message}\n`);
}

export async function runLogout(): Promise<void> {
  clearJwt();
  clearPat();
  clearTapAuth();
  clearTapDeviceSession();
  process.stdout.write('✓ Cleared Maker JWT and PAT\n');
}
