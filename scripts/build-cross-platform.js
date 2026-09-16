#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(scriptDir);

dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });

const plan = {
  server: true,
  proxy: true,
  maker: true,
  native: false,
};

for (const arg of process.argv.slice(2)) {
  switch (arg) {
    case '--skip-native':
    case '-sn':
      plan.native = false;
      break;
    case '--skip-server':
    case '-ss':
      plan.server = false;
      break;
    case '--skip-proxy':
    case '-sp':
      plan.proxy = false;
      break;
    case '--skip-maker':
    case '-sm':
      plan.maker = false;
      break;
    case '--native-only':
    case '-no':
      plan.server = false;
      plan.proxy = false;
      plan.maker = false;
      plan.native = true;
      break;
    case '--server-only':
    case '-so':
      plan.server = true;
      plan.proxy = false;
      plan.maker = false;
      plan.native = false;
      break;
    case '--js-only':
    case '-jo':
      plan.server = true;
      plan.proxy = true;
      plan.maker = true;
      plan.native = false;
      break;
    default:
      throw new Error(`Unknown build option: ${arg}`);
  }
}

/** Run one Node script and preserve its exit status. */
function runNodeScript(relativePath, options = {}) {
  const result = spawnSync(process.execPath, [path.join(projectRoot, relativePath)], {
    cwd: options.cwd || projectRoot,
    env: options.env || process.env,
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

/** Build the native signer or reuse checked-in binaries when credentials are unavailable. */
function buildNativeSigner() {
  const nativeDir = path.join(projectRoot, 'native');
  const clientId = process.env.BUILD_CLIENT_ID || process.env.TAPTAP_MCP_CLIENT_ID;
  const clientSecret = process.env.BUILD_CLIENT_SECRET || process.env.TAPTAP_MCP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    const binaries = fs.existsSync(nativeDir)
      ? fs.readdirSync(nativeDir).filter((name) => name.endsWith('.node'))
      : [];
    if (binaries.length === 0) {
      throw new Error(
        'BUILD_CLIENT_ID and BUILD_CLIENT_SECRET are required when no native/*.node binaries exist.'
      );
    }
    process.stdout.write('Native credentials not set; reusing existing native/*.node binaries.\n');
    return;
  }

  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error('npm_execpath is unavailable; run this build through npm.');
  }
  const result = spawnSync(process.execPath, [npmCli, 'run', 'build'], {
    cwd: nativeDir,
    env: {
      ...process.env,
      BUILD_CLIENT_ID: clientId,
      BUILD_CLIENT_SECRET: clientSecret,
    },
    stdio: 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (plan.native) buildNativeSigner();
if (plan.server) runNodeScript('scripts/bundle-server.js');
if (plan.proxy) runNodeScript('scripts/bundle-proxy.js');
if (plan.maker) runNodeScript('scripts/bundle-maker.js');
