/**
 * Maker clone binding safety tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDevKitGitignoreBlock, DEV_KIT_GITIGNORE_STAGING_FILE } from '../maker/cli/devKit';
import { cloneMakerProject } from '../maker/cli/projects';
import { saveProjectConfig } from '../maker/storage';

describe('maker clone binding safety', () => {
  let tempDir: string;
  const originalGitBin = process.env.TAPTAP_MAKER_GIT_BIN;
  const originalGitBase = process.env.TAPTAP_MAKER_GIT_BASE;
  const originalMakerHome = process.env.TAPTAP_MAKER_HOME;
  const originalRetryDelay = process.env.TAPTAP_MAKER_GIT_RETRY_DELAY_MS;
  const originalPat = process.env.PAT;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-clone-binding-'));
  });

  afterEach(() => {
    restoreEnv('TAPTAP_MAKER_GIT_BIN', originalGitBin);
    restoreEnv('TAPTAP_MAKER_GIT_BASE', originalGitBase);
    restoreEnv('TAPTAP_MAKER_HOME', originalMakerHome);
    restoreEnv('TAPTAP_MAKER_GIT_RETRY_DELAY_MS', originalRetryDelay);
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
    expect(commands).toContain('fetch --progress --depth=1 origin');
    expect(commands).toContain('checkout -B main origin/main');
  });

  test('uses explicit git progress for shallow fetch checkout operations', async () => {
    const emptyTarget = path.join(tempDir, 'empty-target');
    const emptyGitLog = path.join(tempDir, '.test-tools', 'empty-git.log');
    const emptyFakeGit = createFakeGit(emptyGitLog);
    process.env.TAPTAP_MAKER_GIT_BIN = emptyFakeGit;
    process.env.TAPTAP_MAKER_GIT_BASE = 'https://maker.example.test/git';
    process.env.TAPTAP_MAKER_HOME = path.join(tempDir, 'maker-home-empty');
    process.env.PAT = 'tmpct_test_pat';

    await cloneMakerProject({
      appId: 'new-app',
      targetDir: emptyTarget,
      userId: 'user-1',
    });

    const emptyCommands = fs.readFileSync(emptyGitLog, 'utf8');
    expect(emptyCommands).not.toContain('clone --progress');
    expect(emptyCommands).toContain(`init ${emptyTarget}`);
    expect(emptyCommands).toContain('fetch --progress --depth=1 origin');
    expect(emptyCommands).toContain('checkout -B main origin/main');

    const fetchGitLog = path.join(tempDir, '.test-tools', 'fetch-git.log');
    const fetchFakeGit = createFakeGit(fetchGitLog);
    process.env.TAPTAP_MAKER_GIT_BIN = fetchFakeGit;
    process.env.TAPTAP_MAKER_HOME = path.join(tempDir, 'maker-home-fetch');
    fs.writeFileSync(path.join(tempDir, 'tap.zip'), 'local zip\n', 'utf8');

    await cloneMakerProject({
      appId: 'new-app',
      targetDir: tempDir,
      userId: 'user-1',
    });

    const fetchCommands = fs.readFileSync(fetchGitLog, 'utf8');
    expect(fetchCommands).toContain('fetch --progress --depth=1 origin');
  });

  test('initializes an independent Maker repo when target is inside a parent git repo', async () => {
    const parentDir = path.join(tempDir, 'parent-repo');
    const targetDir = path.join(parentDir, 'Tests', 'MacroTests');
    const gitLog = path.join(tempDir, '.test-tools', 'git.log');
    const fakeGit = createFakeGit(gitLog, { parentGitRoot: parentDir });
    process.env.TAPTAP_MAKER_GIT_BIN = fakeGit;
    process.env.TAPTAP_MAKER_GIT_BASE = 'https://maker.example.test/git';
    process.env.TAPTAP_MAKER_HOME = path.join(tempDir, 'maker-home');
    process.env.PAT = 'tmpct_test_pat';
    fs.mkdirSync(path.join(parentDir, '.git'), { recursive: true });
    fs.writeFileSync(
      path.join(parentDir, '.git', 'FAKE_HEAD_COMMIT'),
      '1111111111111111111111111111111111111111',
      'utf8'
    );
    fs.mkdirSync(path.join(targetDir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, '.claude', 'settings.json'), '{}\n', 'utf8');

    const result = await cloneMakerProject({
      appId: 'new-app',
      targetDir,
      userId: 'user-1',
    });

    expect(result.status).toBe('cloned');
    expect(fs.existsSync(path.join(targetDir, '.git'))).toBe(true);
    const commands = fs.readFileSync(gitLog, 'utf8');
    expect(commands).toContain(`init ${targetDir}`);
    expect(commands).toContain('fetch --progress --depth=1 origin');
    expect(commands).toContain('checkout -B main origin/main');
    expect(commands).not.toContain(
      `remote set-url origin https://git:tmpct_test_pat@maker.example.test/git/new-app.git`
    );
  });

  test('redacts PAT from git setup failure command', async () => {
    const gitLog = path.join(tempDir, '.test-tools', 'git.log');
    const fakeGit = createFakeGit(gitLog, { failRemoteSetup: true });
    process.env.TAPTAP_MAKER_GIT_BIN = fakeGit;
    process.env.TAPTAP_MAKER_GIT_BASE = 'https://maker.example.test/git';
    process.env.TAPTAP_MAKER_HOME = path.join(tempDir, 'maker-home');
    process.env.PAT = 'tmpct_test_pat';

    try {
      await cloneMakerProject({
        appId: 'new-app',
        targetDir: tempDir,
        userId: 'user-1',
        forcePat: true,
      });
      throw new Error('Expected clone to fail');
    } catch (error) {
      const command = (error as { failure?: { command?: string } }).failure?.command || '';
      expect(command).toContain('https://git:***@maker.example.test/git/new-app.git');
      expect(command).not.toContain('tmpct_test_pat');
    }
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

  test('resolves remote default branch when origin head is not set after fetch', async () => {
    const gitLog = path.join(tempDir, '.test-tools', 'git.log');
    const fakeGit = createFakeGit(gitLog, { defaultBranch: 'beta', failSymbolicRef: true });
    process.env.TAPTAP_MAKER_GIT_BIN = fakeGit;
    process.env.TAPTAP_MAKER_GIT_BASE = 'https://maker.example.test/git';
    process.env.TAPTAP_MAKER_HOME = path.join(tempDir, 'maker-home');
    process.env.PAT = 'tmpct_test_pat';
    fs.writeFileSync(path.join(tempDir, 'tap.zip'), 'local zip\n', 'utf8');

    const result = await cloneMakerProject({
      appId: 'new-app',
      targetDir: tempDir,
      userId: 'user-1',
    });

    expect(result.status).toBe('cloned');
    const commands = fs.readFileSync(gitLog, 'utf8');
    expect(commands).toContain('ls-remote --symref origin HEAD');
    expect(commands).toContain('checkout -B beta origin/beta');
  });

  test('retries transient Maker git 503 failures during first clone fetch', async () => {
    const gitLog = path.join(tempDir, '.test-tools', 'git.log');
    const fakeGit = createFakeGit(gitLog, { failFirstFetchWith503: true });
    process.env.TAPTAP_MAKER_GIT_BIN = fakeGit;
    process.env.TAPTAP_MAKER_GIT_BASE = 'https://maker.example.test/git';
    process.env.TAPTAP_MAKER_HOME = path.join(tempDir, 'maker-home');
    process.env.TAPTAP_MAKER_GIT_RETRY_DELAY_MS = '1';
    process.env.PAT = 'tmpct_test_pat';
    fs.writeFileSync(path.join(tempDir, 'tap.zip'), 'local zip\n', 'utf8');

    const progressMessages: string[] = [];
    const result = await cloneMakerProject({
      appId: 'new-app',
      targetDir: tempDir,
      userId: 'user-1',
      onProgress: (progress) => progressMessages.push(progress.message),
    });

    expect(result.status).toBe('cloned');
    expect(result.transientRetries).toBe(1);
    expect(progressMessages.join('\n')).toContain('20+ seconds');
    expect(progressMessages.join('\n')).toContain('transient 503/5xx errors are retried');
    expect(progressMessages.join('\n')).toContain('Maker server may still be preparing');
    expect(progressMessages.join('\n')).toContain('retrying 1/2');
    const commands = fs.readFileSync(gitLog, 'utf8');
    expect(commands.match(/^fetch --progress --depth=1 origin$/gm)).toHaveLength(2);
  });

  test('continues from a recorded project config after earlier clone failure', async () => {
    const gitLog = path.join(tempDir, '.test-tools', 'git.log');
    const fakeGit = createFakeGit(gitLog);
    process.env.TAPTAP_MAKER_GIT_BIN = fakeGit;
    process.env.TAPTAP_MAKER_GIT_BASE = 'https://maker.example.test/git';
    process.env.TAPTAP_MAKER_HOME = path.join(tempDir, 'maker-home');
    process.env.PAT = 'tmpct_test_pat';
    saveProjectConfig(tempDir, {
      project_id: 'new-app',
      user_id: 'user-1',
    });

    const result = await cloneMakerProject({
      appId: 'new-app',
      targetDir: tempDir,
      userId: 'user-1',
    });

    expect(result.status).toBe('cloned');
    expect(fs.existsSync(path.join(tempDir, '.git'))).toBe(true);
    const commands = fs.readFileSync(gitLog, 'utf8');
    expect(commands).not.toContain('clone --progress');
    expect(commands).toContain(`init ${tempDir}`);
    expect(commands).toContain('fetch --progress --depth=1 origin');
    expect(commands).toContain('checkout -B main origin/main');
  });

  test('merges staged dev kit gitignore block after clone', async () => {
    const gitLog = path.join(tempDir, '.test-tools', 'git.log');
    const fakeGit = createFakeGit(gitLog, { remoteFiles: ['.gitignore'] });
    process.env.TAPTAP_MAKER_GIT_BIN = fakeGit;
    process.env.TAPTAP_MAKER_GIT_BASE = 'https://maker.example.test/git';
    process.env.TAPTAP_MAKER_HOME = path.join(tempDir, 'maker-home');
    process.env.PAT = 'tmpct_test_pat';
    fs.writeFileSync(
      path.join(tempDir, DEV_KIT_GITIGNORE_STAGING_FILE),
      `${createDevKitGitignoreBlock(['engine-docs'])}\n`,
      'utf8'
    );

    const result = await cloneMakerProject({
      appId: 'new-app',
      targetDir: tempDir,
      userId: 'user-1',
    });

    const gitignore = fs.readFileSync(path.join(tempDir, '.gitignore'), 'utf8');
    expect(result.status).toBe('cloned');
    expect(gitignore).toContain('remote gitignore rule');
    expect(gitignore).toContain('engine-docs/');
    expect(fs.existsSync(path.join(tempDir, DEV_KIT_GITIGNORE_STAGING_FILE))).toBe(false);
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

function createFakeGit(
  logPath: string,
  options: {
    defaultBranch?: string;
    failSymbolicRef?: boolean;
    failFirstFetchWith503?: boolean;
    failRemoteSetup?: boolean;
    parentGitRoot?: string;
    remoteFiles?: string[];
  } = {}
): string {
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
  const parentGitRoot = ${JSON.stringify(options.parentGitRoot || '')};
  if (parentGitRoot && cwd.startsWith(parentGitRoot + path.sep)) {
    console.log(path.join(parentGitRoot, '.git'));
    process.exit(0);
  }
  process.exit(1);
}
if (commandArgs[0] === 'rev-parse' && commandArgs[1] === '--show-toplevel') {
  if (fs.existsSync(path.join(cwd, '.git'))) {
    console.log(cwd);
    process.exit(0);
  }
  const parentGitRoot = ${JSON.stringify(options.parentGitRoot || '')};
  if (parentGitRoot && cwd.startsWith(parentGitRoot + path.sep)) {
    console.log(parentGitRoot);
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
  const parentGitRoot = ${JSON.stringify(options.parentGitRoot || '')};
  if (parentGitRoot && cwd.startsWith(parentGitRoot + path.sep)) {
    const parentHeadFile = path.join(parentGitRoot, '.git', 'FAKE_HEAD_COMMIT');
    if (fs.existsSync(parentHeadFile)) {
      console.log(fs.readFileSync(parentHeadFile, 'utf8'));
      process.exit(0);
    }
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
  if (${JSON.stringify(options.failRemoteSetup === true)}) {
    console.error('fatal: unable to access ' + commandArgs[3] + ': The requested URL returned error: 401');
    process.exit(128);
  }
  process.exit(0);
}
if (commandArgs[0] === 'fetch') {
  if (${JSON.stringify(options.failFirstFetchWith503 === true)}) {
    const marker = path.join(${JSON.stringify(path.dirname(logPath))}, 'fetch-503-seen');
    if (!fs.existsSync(marker)) {
      fs.writeFileSync(marker, '1');
      console.error('fatal: unable to access https://maker.example.test/git/new-app.git: The requested URL returned error: 503');
      process.exit(128);
    }
  }
  process.exit(0);
}
if (commandArgs[0] === 'clone') {
  const target = commandArgs[commandArgs.length - 1];
  fs.mkdirSync(path.join(target, '.git'), { recursive: true });
  fs.writeFileSync(path.join(target, '.git', 'FAKE_HEAD_COMMIT'), '0000000000000000000000000000000000000001');
  process.exit(0);
}
if (commandArgs[0] === 'symbolic-ref') {
  if (${JSON.stringify(options.failSymbolicRef === true)}) {
    process.exit(1);
  }
  console.log('origin/${options.defaultBranch || 'main'}');
  process.exit(0);
}
if (commandArgs[0] === 'ls-remote' && commandArgs[1] === '--symref') {
  console.log('ref: refs/heads/${options.defaultBranch || 'main'}\\tHEAD');
  console.log('0000000000000000000000000000000000000001\\tHEAD');
  process.exit(0);
}
if (commandArgs[0] === 'ls-tree') {
  console.log(${JSON.stringify(options.remoteFiles || [])}.join('\\n'));
  process.exit(0);
}
if (commandArgs[0] === 'checkout') {
  for (const remoteFile of ${JSON.stringify(options.remoteFiles || [])}) {
    const targetFile = path.join(cwd, remoteFile);
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    const content = remoteFile === '.gitignore' ? 'remote gitignore rule\\n' : 'remote file\\n';
    fs.writeFileSync(targetFile, content);
  }
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
