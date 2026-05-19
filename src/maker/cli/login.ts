/**
 * taptap-maker login/logout commands.
 */

import { loginWithTapDeviceFlow } from '../auth/oauth.js';
import { saveManualMakerJwt } from '../auth/jwt.js';
import { clearJwt, clearPat, clearTapAuth, clearTapDeviceSession } from '../storage.js';
import { getStringFlag } from './common.js';

export async function runLogin(flags: Record<string, string | boolean> = {}): Promise<void> {
  const manualJwt = getStringFlag(flags, 'jwt');
  if (manualJwt) {
    saveManualMakerJwt(manualJwt);
    process.stdout.write('✓ Saved Maker JWT from --jwt\n');
    return;
  }

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
