/**
 * Maker clone binding safety tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cloneMakerProject } from '../maker/cli/projects';
import { saveProjectConfig } from '../maker/storage';

describe('maker clone binding safety', () => {
  let tempDir: string;
  const originalGitBin = process.env.TAPTAP_MAKER_GIT_BIN;
  const originalGitBase = process.env.TAPTAP_MAKER_GIT_BASE;
  const originalMakerHome = process.env.TAPTAP_MAKER_HOME;
  const originalPat = process.env.PAT;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-clone-binding-'));
  });

  afterEach(() => {
    restoreEnv('TAPTAP_MAKER_GIT_BIN', originalGitBin);
    restoreEnv('TAPTAP_MAKER_GIT_BASE', originalGitBase);
    restoreEnv('TAPTAP_MAKER_HOME', originalMakerHome);
    restoreEnv('PAT', originalPat);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('stops before clone when target is already bound to another Maker project', async () => {
    saveProjectConfig(tempDir, {
      project_id: 'existing-app',
    });

    await expect(
      cloneMakerProject({
        appId: 'new-app',
        targetDir: tempDir,
      })
    ).rejects.toThrow(
      'Please switch to the directory for the existing project, or create/open a new empty directory for the new project.'
    );
  });

  test('warns for non-config local files without blocking clone', async () => {
    const gitLog = path.join(tempDir, '.test-tools', 'git.log');
    const fakeGit = createFakeGit(gitLog);
    process.env.TAPTAP_MAKER_GIT_BIN = fakeGit;
    process.env.TAPTAP_MAKER_GIT_BASE = 'https://maker.example.test/git';
    process.env.TAPTAP_MAKER_HOME = path.join(tempDir, 'maker-home');
    process.env.PAT = 'tmpct_test_pat';
    fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.claude', 'settings.json'), '{}\n', 'utf8');
    fs.writeFileSync(path.join(tempDir, 'tap.zip'), 'local zip\n', 'utf8');

    const result = await cloneMakerProject({
      appId: 'new-app',
      targetDir: tempDir,
      userId: 'user-1',
    });

    expect(result.status).toBe('cloned');
    expect(result.warnings.join('\n')).toContain('Pre-clone notice');
    expect(result.warnings.join('\n')).toContain('tap.zip');
    expect(result.warnings.join('\n')).not.toContain('.claude');
    expect(fs.existsSync(path.join(tempDir, '.git'))).toBe(true);
    const commands = fs.readFileSync(gitLog, 'utf8');
    expect(commands).toContain('init ');
    expect(commands).toContain('fetch origin');
    expect(commands).toContain('checkout -B main origin/main');
  });

  test('does not warn for ignored dot-prefixed config entries', async () => {
    const gitLog = path.join(tempDir, '.test-tools', 'git.log');
    const fakeGit = createFakeGit(gitLog);
    process.env.TAPTAP_MAKER_GIT_BIN = fakeGit;
    process.env.TAPTAP_MAKER_GIT_BASE = 'https://maker.example.test/git';
    process.env.TAPTAP_MAKER_HOME = path.join(tempDir, 'maker-home');
    process.env.PAT = 'tmpct_test_pat';
    fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.mcp'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.skill'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, '.config'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.ini'), 'local config\n', 'utf8');

    const result = await cloneMakerProject({
      appId: 'new-app',
      targetDir: tempDir,
      userId: 'user-1',
    });

    expect(result.status).toBe('cloned');
    expect(result.warnings).toEqual([]);
    expect(fs.existsSync(path.join(tempDir, '.git'))).toBe(true);
  });

  test('fails when checkout cannot complete after fetch', async () => {
    const gitLog = path.join(tempDir, '.test-tools', 'git.log');
    const fakeGit = createFakeGit(gitLog, { remoteFiles: ['scripts/main.lua'] });
    process.env.TAPTAP_MAKER_GIT_BIN = fakeGit;
    process.env.TAPTAP_MAKER_GIT_BASE = 'https://maker.example.test/git';
    process.env.TAPTAP_MAKER_HOME = path.join(tempDir, 'maker-home');
    process.env.PAT = 'tmpct_test_pat';
    fs.mkdirSync(path.join(tempDir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'scripts', 'main.lua'), '-- local file\n', 'utf8');

    await expect(
      cloneMakerProject({
        appId: 'new-app',
        targetDir: tempDir,
        userId: 'user-1',
      })
    ).rejects.toThrow('Conflicting local files:');
  });
});

function createFakeGit(logPath: string, options: { remoteFiles?: string[] } = {}): string {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const fakeGit = path.join(path.dirname(logPath), 'fake-git.js');
  fs.writeFileSync(
    fakeGit,
    `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(logPath)}, args.join(' ') + '\\n');
if (args[0] === '--version') {
  console.log('git version 2.50.0');
  process.exit(0);
}
let cwd = process.cwd();
let commandArgs = args;
if (args[0] === '-C') {
  cwd = args[1];
  commandArgs = args.slice(2);
}
if (commandArgs[0] === 'rev-parse' && commandArgs[1] === '--git-dir') {
  if (fs.existsSync(path.join(cwd, '.git'))) {
    console.log('.git');
    process.exit(0);
  }
  process.exit(1);
}
if (commandArgs[0] === 'rev-parse' && commandArgs[1] === '--verify' && commandArgs[2] === 'HEAD') {
  const headFile = path.join(cwd, '.git', 'FAKE_HEAD_COMMIT');
  if (fs.existsSync(headFile)) {
    console.log(fs.readFileSync(headFile, 'utf8'));
    process.exit(0);
  }
  process.exit(1);
}
if (commandArgs[0] === 'init') {
  fs.mkdirSync(path.join(commandArgs[1], '.git'), { recursive: true });
  process.exit(0);
}
if (commandArgs[0] === 'remote' && commandArgs[1] === 'get-url') {
  process.exit(1);
}
if (commandArgs[0] === 'remote' && (commandArgs[1] === 'add' || commandArgs[1] === 'set-url')) {
  process.exit(0);
}
if (commandArgs[0] === 'fetch') {
  process.exit(0);
}
if (commandArgs[0] === 'symbolic-ref') {
  console.log('origin/main');
  process.exit(0);
}
if (commandArgs[0] === 'ls-tree') {
  console.log(${JSON.stringify(options.remoteFiles || [])}.join('\\n'));
  process.exit(0);
}
if (commandArgs[0] === 'checkout') {
  fs.writeFileSync(path.join(cwd, '.git', 'FAKE_HEAD_COMMIT'), '0000000000000000000000000000000000000001');
  process.exit(0);
}
process.exit(0);
`,
    'utf8'
  );
  fs.chmodSync(fakeGit, 0o755);
  return fakeGit;
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
