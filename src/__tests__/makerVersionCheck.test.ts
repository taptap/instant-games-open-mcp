import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  PACKAGE_VERSION_CHECK_CACHE_FILE,
  PACKAGE_VERSION_CHECK_TTL_MS,
  DEFAULT_PACKAGE_VERSION_CHECK_TIMEOUT_MS,
  checkMakerPackageUpdate,
  decideMakerPackageUpdate,
  formatMakerPackageUpdateStatus,
  getMakerPackageUpdateStatus,
  type MakerPackageVersionPolicy,
} from '../maker/versionCheck';

describe('maker package version check', () => {
  const policy: MakerPackageVersionPolicy = {
    schema_version: 1,
    latest: '0.0.8',
    latest_beta: '0.0.9-beta.2',
    minimum_supported: '0.0.7',
    blacklist: ['0.0.6'],
    message: 'Please upgrade TapTap Maker MCP.',
    updated_at: '2026-06-23T00:00:00.000Z',
  };

  const originalMakerHome = process.env.TAPTAP_MAKER_HOME;
  const originalPolicyUrl = process.env.TAPTAP_MAKER_VERSION_POLICY_URL;

  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-version-check-'));
    process.env.TAPTAP_MAKER_HOME = path.join(tempDir, 'maker-home');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    restoreEnv('TAPTAP_MAKER_HOME', originalMakerHome);
    restoreEnv('TAPTAP_MAKER_VERSION_POLICY_URL', originalPolicyUrl);
  });

  test('decides required and optional updates with stable beta and dev rules', () => {
    expect(decideMakerPackageUpdate('0.0.5', policy)).toMatchObject({
      status: 'required_upgrade',
      reason: 'below_minimum_supported',
      target_version: '0.0.8',
    });

    expect(decideMakerPackageUpdate('0.0.6', policy)).toMatchObject({
      status: 'required_upgrade',
      reason: 'blacklisted',
      blacklist_match: '0.0.6',
    });

    expect(decideMakerPackageUpdate('0.0.8-beta.1', policy)).toMatchObject({
      status: 'required_upgrade',
      reason: 'beta_outdated',
      target_version: '0.0.9-beta.2',
    });

    expect(decideMakerPackageUpdate('0.0.7', policy)).toMatchObject({
      status: 'update_available',
      target_version: '0.0.8',
    });

    expect(decideMakerPackageUpdate('0.0.8', policy)).toMatchObject({
      status: 'current',
      target_version: '0.0.8',
    });

    expect(decideMakerPackageUpdate('dev', policy)).toMatchObject({
      status: 'skipped',
    });
  });

  test('reuses recent successful cache for exactly under 12 hours', async () => {
    const cachePath = getCachePath();
    const checkedAt = '2026-06-23T00:00:00.000Z';
    const now = new Date(new Date(checkedAt).getTime() + PACKAGE_VERSION_CHECK_TTL_MS - 1);
    writeCache({
      checked_at: checkedAt,
      policy_url: 'https://example.com/policy.json',
      policy,
      decision: {
        status: 'update_available',
        current_version: '0.0.7',
        target_version: '0.0.8',
        latest: '0.0.8',
        latest_beta: '0.0.9-beta.2',
        minimum_supported: '0.0.7',
        checked_at: checkedAt,
        policy_url: 'https://example.com/policy.json',
      },
    });
    const fetchImpl = jest.fn<typeof fetch>();

    const status = await getMakerPackageUpdateStatus({
      currentVersion: '0.0.7',
      now,
      fetchImpl,
      policyUrl: 'https://example.com/policy.json',
    });

    expect(status).toMatchObject({
      status: 'update_available',
      current_version: '0.0.7',
      target_version: '0.0.8',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(fs.existsSync(cachePath)).toBe(true);
  });

  test('prefers fresh successful cache even when a later error is recorded', async () => {
    const checkedAt = '2026-06-23T00:00:00.000Z';
    const now = new Date(new Date(checkedAt).getTime() + PACKAGE_VERSION_CHECK_TTL_MS - 1);
    writeCache({
      checked_at: checkedAt,
      policy_url: 'https://example.com/policy.json',
      policy,
      decision: {
        status: 'update_available',
        current_version: '0.0.7',
        target_version: '0.0.8',
        latest: '0.0.8',
        latest_beta: '0.0.9-beta.2',
        minimum_supported: '0.0.7',
        checked_at: checkedAt,
        policy_url: 'https://example.com/policy.json',
      },
      error: 'temporary network failure',
      error_checked_at: '2026-06-23T01:00:00.000Z',
    });
    const fetchImpl = jest.fn<typeof fetch>();

    const status = await getMakerPackageUpdateStatus({
      currentVersion: '0.0.7',
      now,
      fetchImpl,
      policyUrl: 'https://example.com/policy.json',
    });

    expect(status).toMatchObject({
      status: 'update_available',
      current_version: '0.0.7',
      target_version: '0.0.8',
      error: 'temporary network failure',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('does not reuse fresh successful cache for a different current version', async () => {
    const checkedAt = '2026-06-23T00:00:00.000Z';
    const now = new Date(new Date(checkedAt).getTime() + PACKAGE_VERSION_CHECK_TTL_MS - 1);
    writeCache({
      checked_at: checkedAt,
      policy_url: 'https://example.com/policy.json',
      policy,
      decision: {
        status: 'required_upgrade',
        current_version: '0.0.5',
        target_version: '0.0.8',
        latest: '0.0.8',
        latest_beta: '0.0.9-beta.2',
        minimum_supported: '0.0.7',
        checked_at: checkedAt,
        policy_url: 'https://example.com/policy.json',
      },
    });
    const fetchImpl = jest.fn<typeof fetch>(async () => jsonResponse(policy));

    const status = await getMakerPackageUpdateStatus({
      currentVersion: '0.0.8',
      now,
      fetchImpl,
      policyUrl: 'https://example.com/policy.json',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(status).toMatchObject({
      status: 'current',
      current_version: '0.0.8',
      target_version: '0.0.8',
    });
  });

  test('does not reuse fresh successful cache for a different policy url', async () => {
    const checkedAt = '2026-06-23T00:00:00.000Z';
    const now = new Date(new Date(checkedAt).getTime() + PACKAGE_VERSION_CHECK_TTL_MS - 1);
    writeCache({
      checked_at: checkedAt,
      policy_url: 'https://example.com/old-policy.json',
      policy,
      decision: {
        status: 'current',
        current_version: '0.0.8',
        target_version: '0.0.8',
        latest: '0.0.8',
        latest_beta: '0.0.9-beta.2',
        minimum_supported: '0.0.7',
        checked_at: checkedAt,
        policy_url: 'https://example.com/old-policy.json',
      },
    });
    const nextPolicy: MakerPackageVersionPolicy = {
      ...policy,
      latest: '0.0.10',
      updated_at: '2026-06-23T01:00:00.000Z',
    };
    const fetchImpl = jest.fn<typeof fetch>(async () => jsonResponse(nextPolicy));

    const status = await getMakerPackageUpdateStatus({
      currentVersion: '0.0.8',
      now,
      fetchImpl,
      policyUrl: 'https://example.com/new-policy.json',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(status).toMatchObject({
      status: 'update_available',
      current_version: '0.0.8',
      target_version: '0.0.10',
      policy_url: 'https://example.com/new-policy.json',
    });
  });

  test('retries remote policy fetch when only a recent failure cache exists', async () => {
    const checkedAt = '2026-06-23T00:00:00.000Z';
    const now = new Date(new Date(checkedAt).getTime() + PACKAGE_VERSION_CHECK_TTL_MS - 1);
    writeCache({
      policy_url: 'https://example.com/policy.json',
      error: 'network unavailable',
      error_checked_at: checkedAt,
    });
    const fetchImpl = jest.fn<typeof fetch>(async () => jsonResponse(policy));

    const status = await getMakerPackageUpdateStatus({
      currentVersion: '0.0.7',
      now,
      fetchImpl,
      policyUrl: 'https://example.com/policy.json',
    });

    expect(status).toMatchObject({
      status: 'update_available',
      current_version: '0.0.7',
      target_version: '0.0.8',
      policy_url: 'https://example.com/policy.json',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('does not reuse fresh failure-only cache for a different policy url', async () => {
    const checkedAt = '2026-06-23T00:00:00.000Z';
    const now = new Date(new Date(checkedAt).getTime() + PACKAGE_VERSION_CHECK_TTL_MS - 1);
    writeCache({
      policy_url: 'https://example.com/old-policy.json',
      error: 'network unavailable',
      error_checked_at: checkedAt,
    });
    const fetchImpl = jest.fn<typeof fetch>(async () => jsonResponse(policy));

    const status = await getMakerPackageUpdateStatus({
      currentVersion: '0.0.8',
      now,
      fetchImpl,
      policyUrl: 'https://example.com/new-policy.json',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(status).toMatchObject({
      status: 'current',
      current_version: '0.0.8',
      policy_url: 'https://example.com/new-policy.json',
    });
  });

  test('returns recent failure-only cache without fetch when remote fetch and background refresh are disabled', async () => {
    const checkedAt = '2026-06-23T00:00:00.000Z';
    const now = new Date(new Date(checkedAt).getTime() + PACKAGE_VERSION_CHECK_TTL_MS - 1);
    writeCache({
      policy_url: 'https://example.com/policy.json',
      error: 'network unavailable',
      error_checked_at: checkedAt,
    });
    const fetchImpl = jest.fn<typeof fetch>();

    const status = await getMakerPackageUpdateStatus({
      currentVersion: '0.0.8',
      now,
      fetchImpl,
      policyUrl: 'https://example.com/policy.json',
      allowRemoteFetch: false,
      backgroundRefresh: false,
    });

    expect(status).toMatchObject({
      status: 'unavailable',
      current_version: '0.0.8',
      error: 'network unavailable',
      policy_url: 'https://example.com/policy.json',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('does not claim background retry when remote fetch and background refresh are disabled', async () => {
    const fetchImpl = jest.fn<typeof fetch>();

    const status = await getMakerPackageUpdateStatus({
      currentVersion: '0.0.8',
      now: new Date('2026-06-23T00:00:00.000Z'),
      fetchImpl,
      allowRemoteFetch: false,
      backgroundRefresh: false,
    });

    expect(status).toMatchObject({
      status: 'unavailable',
      current_version: '0.0.8',
      error: 'Maker package version check is temporarily unavailable.',
    });
    expect(status.error).not.toContain('background');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('does not expose stale decision fields when non-blocking status uses a different policy url', async () => {
    const checkedAt = '2026-06-23T00:00:00.000Z';
    writeCache({
      checked_at: checkedAt,
      policy_url: 'https://example.com/old-policy.json',
      policy,
      decision: {
        status: 'update_available',
        current_version: '0.0.7',
        target_version: '0.0.8',
        latest: '0.0.8',
        latest_beta: '0.0.9-beta.2',
        minimum_supported: '0.0.7',
        checked_at: checkedAt,
        policy_url: 'https://example.com/old-policy.json',
      },
    });
    const fetchImpl = jest.fn<typeof fetch>();

    const status = await getMakerPackageUpdateStatus({
      currentVersion: '0.0.7',
      now: new Date('2026-06-23T01:00:00.000Z'),
      fetchImpl,
      policyUrl: 'https://example.com/new-policy.json',
      allowRemoteFetch: false,
      backgroundRefresh: false,
    });

    expect(status).toMatchObject({
      status: 'unavailable',
      current_version: '0.0.7',
      policy_url: 'https://example.com/new-policy.json',
    });
    expect(status).not.toHaveProperty('target_version');
    expect(status).not.toHaveProperty('latest');
    expect(status).not.toHaveProperty('previous_status');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('fetches remote policy once cached success is 12 hours old', async () => {
    const checkedAt = '2026-06-23T00:00:00.000Z';
    const now = new Date(new Date(checkedAt).getTime() + PACKAGE_VERSION_CHECK_TTL_MS);
    writeCache({
      checked_at: checkedAt,
      policy_url: 'https://example.com/policy.json',
      policy,
      decision: {
        status: 'current',
        current_version: '0.0.8',
        target_version: '0.0.8',
        latest: '0.0.8',
        latest_beta: '0.0.9-beta.2',
        minimum_supported: '0.0.7',
        checked_at: checkedAt,
        policy_url: 'https://example.com/policy.json',
      },
    });
    const fetchImpl = jest.fn<typeof fetch>(async () => jsonResponse(policy));

    const status = await getMakerPackageUpdateStatus({
      currentVersion: '0.0.7',
      now,
      fetchImpl,
      policyUrl: 'https://example.com/policy.json',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(status).toMatchObject({
      status: 'update_available',
      current_version: '0.0.7',
      target_version: '0.0.8',
      checked_at: now.toISOString(),
      policy_url: 'https://example.com/policy.json',
    });
  });

  test('returns immediately and starts background check when remote fetch is disabled', async () => {
    const fetchImpl = jest.fn<typeof fetch>(async () => jsonResponse(policy));

    const status = await getMakerPackageUpdateStatus({
      currentVersion: '0.0.7',
      fetchImpl,
      policyUrl: 'https://example.com/policy.json',
      now: new Date('2026-06-23T00:00:00.000Z'),
      allowRemoteFetch: false,
    });

    expect(status).toMatchObject({
      status: 'unavailable',
      current_version: '0.0.7',
      error: 'Maker package version check is running in the background.',
      policy_url: 'https://example.com/policy.json',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('returns unavailable on fetch failure and preserves previous successful decision fields', async () => {
    const checkedAt = '2026-06-23T00:00:00.000Z';
    writeCache({
      checked_at: checkedAt,
      policy_url: 'https://example.com/policy.json',
      policy,
      decision: {
        status: 'update_available',
        current_version: '0.0.7',
        target_version: '0.0.8',
        latest: '0.0.8',
        latest_beta: '0.0.9-beta.2',
        minimum_supported: '0.0.7',
        checked_at: checkedAt,
        policy_url: 'https://example.com/policy.json',
      },
    });
    const fetchImpl = jest.fn<typeof fetch>(async () => {
      throw new Error('network unavailable');
    });

    const status = await checkMakerPackageUpdate({
      currentVersion: '0.0.7',
      now: new Date('2026-06-24T00:00:00.000Z'),
      fetchImpl,
      policyUrl: 'https://example.com/policy.json',
    });

    expect(status).toMatchObject({
      status: 'unavailable',
      current_version: '0.0.7',
      error: 'network unavailable',
      last_success_checked_at: checkedAt,
      previous_status: 'update_available',
      target_version: '0.0.8',
      latest: '0.0.8',
    });
  });

  test('does not copy previous decision fields when current version differs after fetch failure', async () => {
    const checkedAt = '2026-06-23T00:00:00.000Z';
    writeCache({
      checked_at: checkedAt,
      policy_url: 'https://example.com/policy.json',
      policy,
      decision: {
        status: 'required_upgrade',
        current_version: '0.0.5',
        target_version: '0.0.8',
        reason: 'below_minimum_supported',
        latest: '0.0.8',
        latest_beta: '0.0.9-beta.2',
        minimum_supported: '0.0.7',
        checked_at: checkedAt,
        policy_url: 'https://example.com/policy.json',
      },
    });
    const fetchImpl = jest.fn<typeof fetch>(async () => {
      throw new Error('network unavailable');
    });

    const status = await checkMakerPackageUpdate({
      currentVersion: '0.0.8',
      now: new Date('2026-06-24T00:00:00.000Z'),
      fetchImpl,
      policyUrl: 'https://example.com/policy.json',
    });

    expect(status).toMatchObject({
      status: 'unavailable',
      current_version: '0.0.8',
      error: 'network unavailable',
      latest: '0.0.8',
      latest_beta: '0.0.9-beta.2',
      minimum_supported: '0.0.7',
    });
    expect(status).not.toHaveProperty('target_version');
    expect(status).not.toHaveProperty('reason');
    expect(status).not.toHaveProperty('previous_status');
    expect(status).not.toHaveProperty('last_success_checked_at');
  });

  test('failed concurrent check preserves a newer successful cache written during fetch', async () => {
    const fetchImpl = jest.fn<typeof fetch>(async () => {
      writeCache({
        checked_at: '2026-06-23T00:00:01.000Z',
        policy_url: 'https://example.com/policy.json',
        policy,
        decision: {
          status: 'current',
          current_version: '0.0.8',
          target_version: '0.0.8',
          latest: '0.0.8',
          latest_beta: '0.0.9-beta.2',
          minimum_supported: '0.0.7',
          checked_at: '2026-06-23T00:00:01.000Z',
          policy_url: 'https://example.com/policy.json',
        },
      });
      throw new Error('late startup failure');
    });

    const status = await checkMakerPackageUpdate({
      currentVersion: '0.0.8',
      now: new Date('2026-06-23T00:00:02.000Z'),
      fetchImpl,
      policyUrl: 'https://example.com/policy.json',
    });
    const cache = JSON.parse(fs.readFileSync(getCachePath(), 'utf8'));

    expect(status).toMatchObject({
      status: 'unavailable',
      current_version: '0.0.8',
      previous_status: 'current',
      error: 'late startup failure',
    });
    expect(cache.decision).toMatchObject({
      status: 'current',
      current_version: '0.0.8',
    });
    expect(cache.error).toBe('late startup failure');
  });

  test('returns unavailable on invalid json and schema errors without throwing', async () => {
    const invalidJsonFetch = jest.fn<typeof fetch>(
      async () =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => {
            throw new Error('Unexpected token < in JSON');
          },
        }) as Response
    );

    const invalidJsonStatus = await checkMakerPackageUpdate({
      currentVersion: '0.0.8',
      fetchImpl: invalidJsonFetch,
    });

    expect(invalidJsonStatus).toMatchObject({
      status: 'unavailable',
      current_version: '0.0.8',
      error: expect.stringContaining('Unexpected token < in JSON'),
    });

    const invalidSchemaFetch = jest.fn<typeof fetch>(async () =>
      jsonResponse({
        schema_version: 1,
        latest: '0.0.8',
        minimum_supported: '0.0.7',
        blacklist: ['0.0.6'],
        updated_at: '2026-06-23T00:00:00.000Z',
      })
    );

    const invalidSchemaStatus = await checkMakerPackageUpdate({
      currentVersion: '0.0.8',
      fetchImpl: invalidSchemaFetch,
    });

    expect(invalidSchemaStatus).toMatchObject({
      status: 'unavailable',
      current_version: '0.0.8',
      error: expect.stringContaining('latest_beta'),
    });
  });

  test('uses env override policy url and default timeout 3000ms', async () => {
    process.env.TAPTAP_MAKER_VERSION_POLICY_URL = 'https://override.example/policy.json';
    const fetchImpl = jest.fn<typeof fetch>(async () => jsonResponse(policy));

    const status = await checkMakerPackageUpdate({
      currentVersion: '0.0.8',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://override.example/policy.json',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
        },
        signal: expect.any(AbortSignal),
      })
    );
    expect(status).toMatchObject({
      status: 'current',
      policy_url: 'https://override.example/policy.json',
    });
    expect(DEFAULT_PACKAGE_VERSION_CHECK_TIMEOUT_MS).toBe(3000);
  });

  test('writes cache under maker home package-version-check json file', async () => {
    const fetchImpl = jest.fn<typeof fetch>(async () => jsonResponse(policy));

    await checkMakerPackageUpdate({
      currentVersion: '0.0.7',
      fetchImpl,
      now: new Date('2026-06-23T08:00:00.000Z'),
    });

    const cachePath = getCachePath();
    expect(cachePath).toBe(
      path.join(process.env.TAPTAP_MAKER_HOME as string, PACKAGE_VERSION_CHECK_CACHE_FILE)
    );
    expect(fs.existsSync(cachePath)).toBe(true);
  });

  test('formats required upgrade status as stable machine readable text', () => {
    const output = formatMakerPackageUpdateStatus({
      status: 'required_upgrade',
      current_version: '0.0.6',
      target_version: '0.0.8',
      reason: 'blacklisted',
      latest: '0.0.8',
      latest_beta: '0.0.9-beta.2',
      minimum_supported: '0.0.7',
      blacklist_match: '0.0.6',
      checked_at: '2026-06-23T10:00:00.000Z',
      policy_url:
        'https://raw.githubusercontent.com/taptap/instant-games-open-mcp/main/config/maker-version-policy.json',
      message: 'Please upgrade TapTap Maker MCP.',
      next_action:
        'Ask the user for approval, then run `taptap-maker upgrade --target-dir <PROJECT_DIR>`.',
      restart_required: true,
    });

    expect(output).toContain('Maker MCP package update');
    expect(output).toContain('- status: required_upgrade');
    expect(output).toContain('- current_version: 0.0.6');
    expect(output).toContain('- target_version: 0.0.8');
    expect(output).toContain('- reason: blacklisted');
    expect(output).toContain('- next_action: Ask the user for approval');
    expect(output).toContain('- restart_required: yes');
  });
});

function getCachePath(): string {
  return path.join(process.env.TAPTAP_MAKER_HOME as string, PACKAGE_VERSION_CHECK_CACHE_FILE);
}

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => payload,
  } as Response;
}

function writeCache(payload: unknown): void {
  const cachePath = getCachePath();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(payload, null, 2), 'utf8');
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
