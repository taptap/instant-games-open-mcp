import fs from 'node:fs';
import path from 'node:path';
import { compareMakerVersionStrings } from '../versionCheck.js';

const CDN = 'https://urhox-demo-platform.spark.xd.com/runtime';
const VERSION = /^[0-9]+[.][0-9]+(?:[.][0-9]+)?$/;

export type RuntimeRelease = { version: string; sha256: string; url: string };

export async function fetchRuntimeRelease(
  signal?: AbortSignal
): Promise<RuntimeRelease | undefined> {
  const platform =
    process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : undefined;
  if (!platform) return undefined;

  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.throwIfAborted();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 5000);
  try {
    const response = await fetch(CDN + '/' + platform + '/latest.json', {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Runtime release check failed: HTTP ' + response.status);
    const manifest = await response.json();
    const release = manifest?.[platform + '_runtime'];
    if (
      typeof release?.version !== 'string' ||
      !VERSION.test(release.version) ||
      release.version !== manifest.version ||
      typeof release.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(release.sha256)
    ) {
      throw new Error('Runtime release manifest is invalid.');
    }
    return {
      version: release.version,
      sha256: release.sha256.toLowerCase(),
      url: CDN + '/' + platform + '/' + release.version + '/UrhoXRuntime.zip',
    };
  } catch (error) {
    if (signal?.aborted) throw new Error('CANCELLED');
    if (controller.signal.aborted) throw new Error('Runtime release check timed out.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

// Older packages also contain build.json, with a build identifier in place of a release number.
export function runtimeBuildVersion(executable: string): string | undefined {
  const filename = path.join(path.dirname(executable), 'build.json');
  try {
    const file = fs.lstatSync(filename);
    if (!file.isFile() || file.size > 16 * 1024) return undefined;
    const build = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (
      build?.product === 'UrhoXRuntime' &&
      typeof build.version === 'string' &&
      /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,79}$/.test(build.version)
    )
      return build.version;
  } catch {
    // Preview can run without build metadata.
  }
  return undefined;
}

export function runtimeUpdateVersion(
  release: RuntimeRelease | undefined,
  installed: string | undefined
): string | undefined {
  if (!release) return undefined;
  if (!installed || !VERSION.test(installed)) return release.version;
  // Early published versions, such as 1.38, omit the patch component.
  const semver = (version: string) => (version.split('.').length === 2 ? version + '.0' : version);
  return compareMakerVersionStrings(semver(release.version), semver(installed)) > 0
    ? release.version
    : undefined;
}
