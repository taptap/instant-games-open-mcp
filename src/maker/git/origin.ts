/**
 * Maker git origin with PAT authentication embedded in the URL.
 */

import { requestMakerPat } from '../auth/pat.js';
import { getMakerEndpoints, requireMakerEndpoint } from '../config.js';
import { gitStep, type MakerProjectProgressHandler } from './run.js';

export function getConfiguredMakerGitBase(): string | undefined {
  return getMakerEndpoints().gitBase;
}

export function getMakerGitBase(): string {
  return requireMakerEndpoint('gitBase', getConfiguredMakerGitBase()).replace(/\/$/, '');
}

export function makeAuthenticatedGitUrl(gitUrl: string, pat: string): string {
  return gitUrl.replace(/^https:\/\//, `https://git:${encodeURIComponent(pat)}@`);
}

export async function setOrigin(cwd: string, authUrl: string): Promise<void> {
  await gitStep(['remote', 'get-url', 'origin'], { cwd, quiet: true })
    .then(() => gitStep(['remote', 'set-url', 'origin', authUrl], { cwd, quiet: true }))
    .catch(() => gitStep(['remote', 'add', 'origin', authUrl], { cwd, quiet: true }));
}

export async function ensureAuthenticatedOrigin(options: {
  cwd: string;
  appId: string;
  jwt?: string;
  pat?: string;
  forcePat?: boolean;
  onProgress?: MakerProjectProgressHandler;
}): Promise<void> {
  const pat = await requestMakerPat({
    jwt: options.jwt,
    pat: options.pat,
    name: 'first-pat',
    force: options.forcePat,
  });
  const gitUrl = `${getMakerGitBase()}/${options.appId}.git`;
  const authUrl = makeAuthenticatedGitUrl(gitUrl, pat.token);

  await setOrigin(options.cwd, authUrl);
  options.onProgress?.({
    progress: 8,
    total: 100,
    phase: 'auth',
    message: 'Maker git origin updated with PAT authentication',
  });
}
