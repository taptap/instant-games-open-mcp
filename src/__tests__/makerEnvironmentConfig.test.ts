/**
 * Maker environment resolution tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  getMakerEnvironment,
  getMakerProjectEnvironmentConfigPath,
  setMakerEnvironmentOverride,
} from '../maker/config';

describe('maker environment config', () => {
  const originalCwd = process.cwd();
  const originalEnv = process.env.TAPTAP_MCP_ENV;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-env-config-'));
    delete process.env.TAPTAP_MCP_ENV;
    setMakerEnvironmentOverride(undefined);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    restoreEnv('TAPTAP_MCP_ENV', originalEnv);
    setMakerEnvironmentOverride(undefined);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('uses project local config from .maker directory', () => {
    const realTempDir = fs.realpathSync(tempDir);
    fs.mkdirSync(path.join(tempDir, '.maker'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, '.maker', 'taptap-maker.local.json'),
      JSON.stringify({ env: 'rnd' }),
      'utf8'
    );
    fs.mkdirSync(path.join(tempDir, 'nested'), { recursive: true });
    process.chdir(path.join(tempDir, 'nested'));

    expect(getMakerEnvironment()).toBe('rnd');
    expect(getMakerProjectEnvironmentConfigPath()).toBe(
      path.join(realTempDir, '.maker', 'taptap-maker.local.json')
    );
  });

  test('keeps production as default when project config is absent', () => {
    process.chdir(tempDir);

    expect(getMakerEnvironment()).toBe('production');
  });

  test('does not read legacy root local config', () => {
    fs.writeFileSync(
      path.join(tempDir, '.taptap-maker.local.json'),
      JSON.stringify({ env: 'rnd' }),
      'utf8'
    );
    process.chdir(tempDir);

    expect(getMakerEnvironment()).toBe('production');
    expect(getMakerProjectEnvironmentConfigPath()).toBeUndefined();
  });

  test('can resolve project local config from an explicit target directory', () => {
    const projectDir = path.join(tempDir, 'project');
    const nestedDir = path.join(projectDir, 'nested');
    fs.mkdirSync(path.join(projectDir, '.maker'), { recursive: true });
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.maker', 'taptap-maker.local.json'),
      JSON.stringify({ env: 'rnd' }),
      'utf8'
    );

    expect(getMakerEnvironment(undefined, nestedDir)).toBe('rnd');
  });

  test('lets explicit environment override project local config', () => {
    fs.mkdirSync(path.join(tempDir, '.maker'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, '.maker', 'taptap-maker.local.json'),
      JSON.stringify({ env: 'rnd' }),
      'utf8'
    );
    process.env.TAPTAP_MCP_ENV = 'production';
    process.chdir(tempDir);

    expect(getMakerEnvironment()).toBe('production');
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
