import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const nodeRequire = createRequire(__filename);
const { updateMakerVersionPolicy } = nodeRequire('../../scripts/update-maker-version-policy.cjs');

describe('Maker version policy updater', () => {
  test('updates latest for stable publishes without touching manual policy fields', () => {
    const file = writePolicy({
      latest: '0.0.20',
      latest_beta: '0.0.19-beta.1',
      minimum_supported: '0.0.1',
      blacklist: ['0.0.5'],
      message: 'Manual operator note.',
      updated_at: '2026-06-23T00:00:00.000Z',
    });

    const result = updateMakerVersionPolicy({
      file,
      tag: 'latest',
      version: '0.0.21',
      updatedAt: '2026-06-24T00:00:00.000Z',
    });

    const policy = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(result).toEqual({
      changed: true,
      field: 'latest',
      version: '0.0.21',
    });
    expect(policy).toMatchObject({
      latest: '0.0.21',
      latest_beta: '0.0.19-beta.1',
      minimum_supported: '0.0.1',
      blacklist: ['0.0.5'],
      message: 'Manual operator note.',
      updated_at: '2026-06-24T00:00:00.000Z',
    });
  });

  test('updates latest_beta for beta publishes', () => {
    const file = writePolicy({
      latest: '0.0.20',
      latest_beta: '0.0.19-beta.1',
      minimum_supported: '0.0.1',
      blacklist: [],
      message: 'Manual operator note.',
      updated_at: '2026-06-23T00:00:00.000Z',
    });

    const result = updateMakerVersionPolicy({
      file,
      tag: 'beta',
      version: '0.0.21-beta.1',
      updatedAt: '2026-06-24T00:00:00.000Z',
    });

    const policy = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(result).toEqual({
      changed: true,
      field: 'latest_beta',
      version: '0.0.21-beta.1',
    });
    expect(policy.latest).toBe('0.0.20');
    expect(policy.latest_beta).toBe('0.0.21-beta.1');
    expect(policy.minimum_supported).toBe('0.0.1');
    expect(policy.blacklist).toEqual([]);
  });

  test('does not update policy for alpha or next publishes', () => {
    const file = writePolicy({
      latest: '0.0.20',
      latest_beta: '0.0.19-beta.1',
      minimum_supported: '0.0.1',
      blacklist: [],
      message: 'Manual operator note.',
      updated_at: '2026-06-23T00:00:00.000Z',
    });
    const before = fs.readFileSync(file, 'utf8');

    const result = updateMakerVersionPolicy({
      file,
      tag: 'next',
      version: '0.0.21-next.1',
      updatedAt: '2026-06-24T00:00:00.000Z',
    });

    expect(result).toEqual({
      changed: false,
      field: undefined,
      version: '0.0.21-next.1',
    });
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });
});

function writePolicy(overrides: Record<string, unknown>): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-policy-update-'));
  const file = path.join(tempDir, 'maker-version-policy.json');
  fs.writeFileSync(
    file,
    `${JSON.stringify(
      {
        schema_version: 1,
        ...overrides,
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  return file;
}
