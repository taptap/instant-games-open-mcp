/**
 * taptap-maker login/logout commands.
 */

import { loginWithTapDeviceFlow } from '../auth/oauth.js';
import { requestTapAuthWithPat } from '../auth/patTap.js';
import { saveManualMakerJwt } from '../auth/jwt.js';
import { saveManualMakerPat } from '../git/pat.js';
import { clearJwt, clearPat, clearTapAuth, clearTapDeviceSession } from '../storage.js';
import { getStringFlag } from './common.js';

export async function runLogin(flags: Record<string, string | boolean> = {}): Promise<void> {
  const manualPat = getStringFlag(flags, 'pat');
  if (manualPat) {
    saveManualMakerPat(manualPat);
    const tapAuth = await requestTapAuthWithPat(manualPat);
    process.stdout.write(
      [
        '✓ Saved Maker PAT from --pat to ~/.taptap-maker/pat.json',
        `✓ Saved TapTap token for kid ${mask(tapAuth.kid)} to ~/.taptap-maker/tap-auth.json`,
        '',
      ].join('\n')
    );
    return;
  }

  const manualJwt = getStringFlag(flags, 'jwt');
  if (manualJwt) {
    saveManualMakerJwt(manualJwt);
    process.stdout.write('✓ Saved Maker JWT from --jwt to ~/.taptap-maker/jwt.json\n');
    return;
  }

  process.stderr.write(
    [
      'No --pat was provided. Legacy Tap OAuth device flow will be used.',
      'Current recommended PAT flow:',
      '1. Get a Maker PAT from the Maker backend or admin UI.',
      '2. Run `taptap-maker login --pat <maker_pat>`.',
      '3. Use `taptap-maker projects list` to choose a Maker app.',
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
  process.stdout.write('✓ Cleared Maker PAT, JWT, and Tap auth\n');
}

function mask(value: string): string {
  return value.length <= 10 ? value : `${value.slice(0, 6)}...${value.slice(-4)}`;
}
