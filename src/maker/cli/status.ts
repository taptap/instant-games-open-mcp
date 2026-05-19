/**
 * taptap-maker status command.
 */

import { identifyMakerProject } from '../server/identify.js';
import {
  getJwtPath,
  getMakerHome,
  getPatPath,
  getTapAuthPath,
  getTapDeviceSessionPath,
  loadJwt,
  loadPat,
  loadTapAuth,
  loadTapDeviceSession,
} from '../storage.js';
import { getMakerJwtExchangeUrl } from '../auth/jwt.js';
import { getConfiguredMakerPatUrl } from '../git/pat.js';
import { getConfiguredMakerApiBase, getConfiguredMakerGitBase } from './projects.js';
import { isJsonMode, printJson } from './common.js';

export async function runStatus(flags: Record<string, string | boolean>): Promise<void> {
  const identify = identifyMakerProject();
  const jwt = loadJwt();
  const pat = loadPat();
  const tapAuth = loadTapAuth();
  const tapSession = loadTapDeviceSession();
  const status = {
    maker_home: getMakerHome(),
    jwt_path: getJwtPath(),
    pat_path: getPatPath(),
    tap_auth_path: getTapAuthPath(),
    tap_device_session_path: getTapDeviceSessionPath(),
    tap_logged_in: !!tapAuth,
    has_tap_login_session: !!tapSession,
    logged_in: !!jwt,
    has_pat: !!pat,
    project: identify,
    env: {
      MAKER_JWT_EXCHANGE_URL: !!getMakerJwtExchangeUrl(),
      TAPTAP_MAKER_API_BASE: !!getConfiguredMakerApiBase(),
      TAPTAP_MAKER_PAT_URL: !!getConfiguredMakerPatUrl(),
      TAPTAP_MAKER_GIT_BASE: !!getConfiguredMakerGitBase(),
      SCE_MCP_URL: !!process.env.SCE_MCP_URL,
    },
  };

  if (isJsonMode(flags)) {
    printJson(status);
    return;
  }

  process.stdout.write('TapTap Maker local status\n');
  process.stdout.write(`- maker_home: ${status.maker_home}\n`);
  process.stdout.write(`- tap_logged_in: ${status.tap_logged_in ? 'yes' : 'no'}\n`);
  process.stdout.write(`- has_tap_login_session: ${status.has_tap_login_session ? 'yes' : 'no'}\n`);
  process.stdout.write(`- logged_in: ${status.logged_in ? 'yes' : 'no'}\n`);
  process.stdout.write(`- has_pat: ${status.has_pat ? 'yes' : 'no'}\n`);
  process.stdout.write(`- project_source: ${identify.source}\n`);
  process.stdout.write(`- project_id: ${identify.projectId || '(none)'}\n`);
  if (identify.configPath) {
    process.stdout.write(`- config: ${identify.configPath}\n`);
  }
}
