/**
 * Maker MCP package version policy check helpers.
 *
 * This module only checks version policy, caches results, and formats
 * status output. It never runs upgrade commands.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fetchWithTimeout } from './fetchTimeout.js';
import { getMakerHome } from './storage.js';

const DEFAULT_POLICY_URL =
  'https://raw.githubusercontent.com/taptap/instant-games-open-mcp/main/config/maker-version-policy.json';
const POLICY_URL_ENV = 'TAPTAP_MAKER_VERSION_POLICY_URL';

export const DEFAULT_PACKAGE_VERSION_CHECK_TIMEOUT_MS = 3000;
export const PACKAGE_VERSION_CHECK_TTL_MS = 12 * 60 * 60 * 1000;
export const PACKAGE_VERSION_CHECK_CACHE_FILE = 'package-version-check.json';

type MakerPackageUpdateDecisionStatus =
  | 'current'
  | 'update_available'
  | 'required_upgrade'
  | 'unavailable'
  | 'skipped';

type MakerPackageUpdateReason =
  | 'blacklisted'
  | 'below_minimum_supported'
  | 'beta_outdated'
  | 'dev_version';

export interface MakerPackageVersionPolicy {
  schema_version: 1;
  latest: string;
  latest_beta: string;
  minimum_supported: string;
  blacklist: string[];
  message?: string;
  updated_at: string;
}

export interface MakerPackageUpdateStatus {
  status: MakerPackageUpdateDecisionStatus;
  current_version: string;
  target_version?: string;
  reason?: MakerPackageUpdateReason;
  minimum_supported?: string;
  latest?: string;
  latest_beta?: string;
  blacklist_match?: string;
  checked_at?: string;
  policy_url?: string;
  message?: string;
  next_action?: string;
  restart_required?: boolean;
  error?: string;
  last_success_checked_at?: string;
  previous_status?: Exclude<MakerPackageUpdateDecisionStatus, 'unavailable'>;
}

export interface MakerPackageUpdateCheckOptions {
  currentVersion: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  policyUrl?: string;
  now?: Date;
  allowRemoteFetch?: boolean;
}

interface MakerPackageVersionCheckCache {
  checked_at?: string;
  policy_url?: string;
  policy?: MakerPackageVersionPolicy;
  decision?: MakerPackageUpdateStatus;
  error?: string;
  error_checked_at?: string;
}

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

export function decideMakerPackageUpdate(
  currentVersion: string,
  policy: MakerPackageVersionPolicy
): MakerPackageUpdateStatus {
  if (currentVersion === 'dev') {
    return {
      status: 'skipped',
      current_version: currentVersion,
      reason: 'dev_version',
      latest: policy.latest,
      latest_beta: policy.latest_beta,
      minimum_supported: policy.minimum_supported,
      message: policy.message,
      next_action: 'Continue normal work; dev builds do not use remote version policy.',
      restart_required: false,
    };
  }

  const current = parseVersion(currentVersion);
  const latest = parseVersion(policy.latest);
  const latestBeta = parseVersion(policy.latest_beta);
  const minimumSupported = parseVersion(policy.minimum_supported);

  if (!current || !latest || !latestBeta || !minimumSupported) {
    throw new Error('Invalid version data for Maker package update decision.');
  }

  const isPrerelease = current.prerelease.length > 0;
  if (policy.blacklist.includes(currentVersion)) {
    return buildDecision('required_upgrade', currentVersion, policy, {
      reason: 'blacklisted',
      target_version: isPrerelease ? policy.latest_beta : policy.latest,
      blacklist_match: currentVersion,
      restart_required: true,
      next_action:
        'Ask the user for approval, then run `taptap-maker upgrade --target-dir <PROJECT_DIR>`.',
    });
  }

  if (compareVersions(current, minimumSupported) < 0) {
    return buildDecision('required_upgrade', currentVersion, policy, {
      reason: 'below_minimum_supported',
      target_version: isPrerelease ? policy.latest_beta : policy.latest,
      restart_required: true,
      next_action:
        'Ask the user for approval, then run `taptap-maker upgrade --target-dir <PROJECT_DIR>`.',
    });
  }

  if (isPrerelease && compareVersions(current, latestBeta) < 0) {
    return buildDecision('required_upgrade', currentVersion, policy, {
      reason: 'beta_outdated',
      target_version: policy.latest_beta,
      restart_required: true,
      next_action:
        'Ask the user for approval, then run `taptap-maker upgrade --target-dir <PROJECT_DIR>`.',
    });
  }

  if (!isPrerelease && compareVersions(current, latest) < 0) {
    return buildDecision('update_available', currentVersion, policy, {
      target_version: policy.latest,
      restart_required: false,
      next_action:
        'Tell the user an update is available. Only run `taptap-maker upgrade` after approval.',
    });
  }

  return buildDecision('current', currentVersion, policy, {
    target_version: isPrerelease ? policy.latest_beta : policy.latest,
    restart_required: false,
    next_action: 'Continue normal work; no package upgrade is required.',
  });
}

export async function checkMakerPackageUpdate(
  options: MakerPackageUpdateCheckOptions
): Promise<MakerPackageUpdateStatus> {
  const now = options.now ?? new Date();
  const currentVersion = options.currentVersion;

  if (currentVersion === 'dev') {
    return {
      status: 'skipped',
      current_version: currentVersion,
      reason: 'dev_version',
      checked_at: now.toISOString(),
      next_action: 'Continue normal work; dev builds do not use remote version policy.',
      restart_required: false,
    };
  }

  const policyUrl = resolvePolicyUrl(options.policyUrl);

  try {
    const policy = await fetchMakerPackageVersionPolicy({
      fetchImpl: options.fetchImpl,
      policyUrl,
      timeoutMs: options.timeoutMs,
    });
    const decision = decideMakerPackageUpdate(currentVersion, policy);
    const status: MakerPackageUpdateStatus = {
      ...decision,
      current_version: currentVersion,
      checked_at: now.toISOString(),
      policy_url: policyUrl,
      latest: policy.latest,
      latest_beta: policy.latest_beta,
      minimum_supported: policy.minimum_supported,
      message: policy.message,
    };

    writeCache({
      checked_at: status.checked_at,
      policy_url: policyUrl,
      policy,
      decision: status,
    });
    return status;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const latestCache = readCache();
    const unavailableStatus = buildUnavailableStatus({
      cache: latestCache,
      currentVersion,
      error: message,
    });

    writeCache({
      checked_at: latestCache?.checked_at,
      policy_url: latestCache?.policy_url || policyUrl,
      policy: latestCache?.policy,
      decision: latestCache?.decision,
      error: message,
      error_checked_at: now.toISOString(),
    });
    return unavailableStatus;
  }
}

export async function getMakerPackageUpdateStatus(
  options: MakerPackageUpdateCheckOptions
): Promise<MakerPackageUpdateStatus> {
  const currentVersion = options.currentVersion;
  if (currentVersion === 'dev') {
    return {
      status: 'skipped',
      current_version: currentVersion,
      reason: 'dev_version',
      checked_at: (options.now ?? new Date()).toISOString(),
      next_action: 'Continue normal work; dev builds do not use remote version policy.',
      restart_required: false,
    };
  }

  const cache = readCache();
  const now = options.now ?? new Date();
  const lastSuccessCheckedAt = getLastSuccessCheckedAt(cache);
  const lastErrorCheckedAt = getLastErrorCheckedAt(cache);
  const hasCurrentVersionDecision = cache?.decision?.current_version === currentVersion;

  if (
    cache?.decision &&
    hasCurrentVersionDecision &&
    lastSuccessCheckedAt &&
    isCacheFresh(lastSuccessCheckedAt, now)
  ) {
    return cache.error
      ? {
          ...cache.decision,
          error: cache.error,
        }
      : cache.decision;
  }

  if (
    cache?.error &&
    !cache?.decision &&
    lastErrorCheckedAt &&
    isCacheFresh(lastErrorCheckedAt, now)
  ) {
    return buildUnavailableStatus({
      cache,
      currentVersion,
      error: cache.error,
    });
  }

  if (options.allowRemoteFetch === false) {
    startMakerPackageUpdateCheck(options);
    return buildUnavailableStatus({
      cache,
      currentVersion,
      error: cache?.error
        ? `${cache.error}; background retry started.`
        : 'Maker package version check is running in the background.',
      checkedAt: now.toISOString(),
      policyUrl: resolvePolicyUrl(options.policyUrl),
    });
  }

  return checkMakerPackageUpdate(options);
}

let backgroundCheck:
  | {
      key: string;
      promise: Promise<void>;
    }
  | undefined;

export function startMakerPackageUpdateCheck(options: MakerPackageUpdateCheckOptions): void {
  const key = `${options.currentVersion}\n${resolvePolicyUrl(options.policyUrl)}`;
  if (backgroundCheck?.key === key) {
    return;
  }
  const promise = checkMakerPackageUpdate(options)
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => {
      if (backgroundCheck?.promise === promise) {
        backgroundCheck = undefined;
      }
    });
  backgroundCheck = { key, promise };
}

export function formatMakerPackageUpdateStatus(status: MakerPackageUpdateStatus): string {
  const lines = ['Maker MCP package update', ''];

  lines.push(`- status: ${status.status}`);
  lines.push(`- current_version: ${status.current_version}`);

  if (status.target_version) {
    lines.push(`- target_version: ${status.target_version}`);
  }
  if (status.reason) {
    lines.push(`- reason: ${status.reason}`);
  }
  if (status.minimum_supported) {
    lines.push(`- minimum_supported: ${status.minimum_supported}`);
  }
  if (status.latest) {
    lines.push(`- latest: ${status.latest}`);
  }
  if (status.latest_beta) {
    lines.push(`- latest_beta: ${status.latest_beta}`);
  }
  if (status.blacklist_match) {
    lines.push(`- blacklist_match: ${status.blacklist_match}`);
  } else if (status.status !== 'skipped') {
    lines.push('- blacklist_match: no');
  }
  if (status.checked_at) {
    lines.push(`- checked_at: ${status.checked_at}`);
  }
  if (status.policy_url) {
    lines.push(`- policy_url: ${status.policy_url}`);
  }
  if (status.message) {
    lines.push(`- message: ${status.message}`);
  }
  if (status.error) {
    lines.push(`- error: ${status.error}`);
  }
  if (status.last_success_checked_at) {
    lines.push(`- last_success_checked_at: ${status.last_success_checked_at}`);
  }
  if (status.previous_status) {
    lines.push(`- previous_status: ${status.previous_status}`);
  }
  if (status.next_action) {
    lines.push(`- next_action: ${status.next_action}`);
  }
  if (typeof status.restart_required === 'boolean') {
    lines.push(`- restart_required: ${status.restart_required ? 'yes' : 'no'}`);
  }

  return lines.join('\n');
}

async function fetchMakerPackageVersionPolicy(options: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  policyUrl: string;
}): Promise<MakerPackageVersionPolicy> {
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchWithTimeout(
    fetchImpl,
    options.policyUrl,
    {
      headers: {
        Accept: 'application/json',
      },
    },
    options.timeoutMs ?? DEFAULT_PACKAGE_VERSION_CHECK_TIMEOUT_MS,
    'Maker package version check'
  );

  if (!response.ok) {
    throw new Error(
      `Maker package version check failed: HTTP ${response.status} ${response.statusText}`
    );
  }

  const payload = await response.json();
  return parsePolicy(payload);
}

function parsePolicy(payload: unknown): MakerPackageVersionPolicy {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid Maker package version policy schema: expected an object.');
  }

  const policy = payload as Partial<MakerPackageVersionPolicy>;
  if (policy.schema_version !== 1) {
    throw new Error('Invalid Maker package version policy schema: schema_version must be 1.');
  }
  if (!isValidVersionString(policy.latest)) {
    throw new Error('Invalid Maker package version policy schema: latest must be a semver string.');
  }
  if (!isValidVersionString(policy.latest_beta)) {
    throw new Error(
      'Invalid Maker package version policy schema: latest_beta must be a semver string.'
    );
  }
  if (!isValidVersionString(policy.minimum_supported)) {
    throw new Error(
      'Invalid Maker package version policy schema: minimum_supported must be a semver string.'
    );
  }
  if (
    !Array.isArray(policy.blacklist) ||
    policy.blacklist.some((item) => !isValidVersionString(item))
  ) {
    throw new Error(
      'Invalid Maker package version policy schema: blacklist must be a semver string array.'
    );
  }
  if (typeof policy.updated_at !== 'string' || Number.isNaN(Date.parse(policy.updated_at))) {
    throw new Error(
      'Invalid Maker package version policy schema: updated_at must be an ISO timestamp string.'
    );
  }
  if (policy.message !== undefined && typeof policy.message !== 'string') {
    throw new Error('Invalid Maker package version policy schema: message must be a string.');
  }

  return {
    schema_version: 1,
    latest: policy.latest,
    latest_beta: policy.latest_beta,
    minimum_supported: policy.minimum_supported,
    blacklist: [...policy.blacklist],
    message: policy.message,
    updated_at: policy.updated_at,
  };
}

function buildDecision(
  status: Exclude<MakerPackageUpdateDecisionStatus, 'unavailable' | 'skipped'>,
  currentVersion: string,
  policy: MakerPackageVersionPolicy,
  overrides: Partial<MakerPackageUpdateStatus>
): MakerPackageUpdateStatus {
  return {
    status,
    current_version: currentVersion,
    latest: policy.latest,
    latest_beta: policy.latest_beta,
    minimum_supported: policy.minimum_supported,
    message: policy.message,
    ...overrides,
  };
}

function buildUnavailableStatus(options: {
  cache?: MakerPackageVersionCheckCache;
  currentVersion: string;
  error: string;
  checkedAt?: string;
  policyUrl?: string;
}): MakerPackageUpdateStatus {
  const previousDecision = options.cache?.decision;
  const hasCurrentVersionDecision = previousDecision?.current_version === options.currentVersion;
  const lastSuccessCheckedAt = hasCurrentVersionDecision
    ? getLastSuccessCheckedAt(options.cache)
    : undefined;
  const previousPolicy = options.cache?.policy;

  return compactStatus({
    status: 'unavailable',
    current_version: options.currentVersion,
    target_version: hasCurrentVersionDecision ? previousDecision?.target_version : undefined,
    reason: hasCurrentVersionDecision ? previousDecision?.reason : undefined,
    minimum_supported:
      (hasCurrentVersionDecision ? previousDecision?.minimum_supported : undefined) ??
      previousPolicy?.minimum_supported,
    latest:
      (hasCurrentVersionDecision ? previousDecision?.latest : undefined) ?? previousPolicy?.latest,
    latest_beta:
      (hasCurrentVersionDecision ? previousDecision?.latest_beta : undefined) ??
      previousPolicy?.latest_beta,
    blacklist_match: hasCurrentVersionDecision ? previousDecision?.blacklist_match : undefined,
    checked_at: options.checkedAt,
    policy_url: options.cache?.policy_url ?? options.policyUrl,
    message:
      (hasCurrentVersionDecision ? previousDecision?.message : undefined) ??
      previousPolicy?.message,
    error: options.error,
    last_success_checked_at: lastSuccessCheckedAt,
    previous_status:
      hasCurrentVersionDecision &&
      previousDecision?.status &&
      previousDecision.status !== 'unavailable'
        ? previousDecision.status
        : undefined,
    next_action: 'Continue normal work; retry status later.',
    restart_required: false,
  });
}

function compactStatus(status: MakerPackageUpdateStatus): MakerPackageUpdateStatus {
  return Object.fromEntries(
    Object.entries(status).filter(([, value]) => value !== undefined)
  ) as unknown as MakerPackageUpdateStatus;
}

function readCache(): MakerPackageVersionCheckCache | undefined {
  const cachePath = getMakerPackageVersionCheckCachePath();
  if (!fs.existsSync(cachePath)) {
    return undefined;
  }

  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8')) as MakerPackageVersionCheckCache;
  } catch {
    return undefined;
  }
}

function writeCache(cache: MakerPackageVersionCheckCache): void {
  const cachePath = getMakerPackageVersionCheckCachePath();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
}

function getMakerPackageVersionCheckCachePath(): string {
  return path.join(getMakerHome(), PACKAGE_VERSION_CHECK_CACHE_FILE);
}

function getLastSuccessCheckedAt(cache?: MakerPackageVersionCheckCache): string | undefined {
  if (!cache) {
    return undefined;
  }
  if (cache.decision?.status && cache.decision.status !== 'unavailable') {
    return cache.decision.checked_at || cache.checked_at;
  }
  return cache.checked_at;
}

function getLastErrorCheckedAt(cache?: MakerPackageVersionCheckCache): string | undefined {
  return cache?.error_checked_at;
}

function isCacheFresh(checkedAt: string, now: Date): boolean {
  const checkedMs = Date.parse(checkedAt);
  if (Number.isNaN(checkedMs)) {
    return false;
  }
  return now.getTime() - checkedMs < PACKAGE_VERSION_CHECK_TTL_MS;
}

function resolvePolicyUrl(policyUrl?: string): string {
  return policyUrl || process.env[POLICY_URL_ENV] || DEFAULT_POLICY_URL;
}

function isValidVersionString(value: unknown): value is string {
  return typeof value === 'string' && parseVersion(value) !== undefined;
}

function parseVersion(version: string): ParsedVersion | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(version.trim());
  if (!match) {
    return undefined;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function compareVersions(left: ParsedVersion, right: ParsedVersion): number {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  if (left.patch !== right.patch) {
    return left.patch - right.patch;
  }

  const leftPre = left.prerelease;
  const rightPre = right.prerelease;
  if (leftPre.length === 0 && rightPre.length === 0) {
    return 0;
  }
  if (leftPre.length === 0) {
    return 1;
  }
  if (rightPre.length === 0) {
    return -1;
  }

  const length = Math.max(leftPre.length, rightPre.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = leftPre[index];
    const rightIdentifier = rightPre[index];
    if (leftIdentifier === undefined) {
      return -1;
    }
    if (rightIdentifier === undefined) {
      return 1;
    }
    const compared = comparePrereleaseIdentifier(leftIdentifier, rightIdentifier);
    if (compared !== 0) {
      return compared;
    }
  }

  return 0;
}

function comparePrereleaseIdentifier(left: string, right: string): number {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);

  if (leftNumeric && rightNumeric) {
    return Number(left) - Number(right);
  }
  if (leftNumeric) {
    return -1;
  }
  if (rightNumeric) {
    return 1;
  }
  return left.localeCompare(right);
}
