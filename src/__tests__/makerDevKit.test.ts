import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AI_DEV_KIT_URLS,
  createDevKitGitignoreBlock,
  DEV_KIT_GITIGNORE_STAGING_FILE,
  finalizeStagedDevKitGitignore,
  inspectAiDevKit,
  installAiDevKit,
  listPresentDevKitManagedEntries,
  mergeDevKitGitignore,
  resolveDefaultAiDevKitUrl,
} from '../maker/cli/devKit';

describe('Maker AI dev kit install', () => {
  let tempDir: string;
  let sourceDir: string;
  let targetDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-dev-kit-'));
    sourceDir = path.join(tempDir, 'ai-dev-kit');
    targetDir = path.join(tempDir, 'target');
    fs.mkdirSync(path.join(sourceDir, 'engine-docs'), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, '.emmylua'), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, 'examples'), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, 'templates'), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, 'urhox-libs'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'engine-docs', 'README.md'), 'docs\n', 'utf8');
    fs.writeFileSync(path.join(sourceDir, 'scripts', 'main.lua'), '-- should skip\n', 'utf8');
    fs.writeFileSync(path.join(sourceDir, 'ai-dev-kit.zip'), 'temporary zip\n', 'utf8');
    fs.writeFileSync(
      path.join(sourceDir, '.emmylua', 'Engine.d.lua'),
      '---@class Engine\n',
      'utf8'
    );
    fs.writeFileSync(path.join(sourceDir, 'examples', 'README.md'), 'examples\n', 'utf8');
    fs.writeFileSync(path.join(sourceDir, 'templates', 'README.md'), 'templates\n', 'utf8');
    fs.writeFileSync(path.join(sourceDir, 'urhox-libs', 'README.md'), 'libs\n', 'utf8');
    fs.writeFileSync(path.join(sourceDir, 'CLAUDE.md'), 'local agent docs\n', 'utf8');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('installs dev kit but skips top-level scripts', async () => {
    const result = await installAiDevKit({
      sourceDir,
      targetDir,
    });

    expect(result.installedEntries).toEqual([
      '.emmylua',
      'CLAUDE.md',
      'engine-docs',
      'examples',
      'templates',
      'urhox-libs',
    ]);
    expect(result.skippedEntries).toEqual(['ai-dev-kit.zip', 'scripts']);
    expect(fs.existsSync(path.join(targetDir, 'engine-docs', 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, '.emmylua', 'Engine.d.lua'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'examples', 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'templates', 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'scripts'))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, 'ai-dev-kit.zip'))).toBe(false);
  });

  test('detects required dev kit entries', async () => {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'CLAUDE.md'), 'local guide\n', 'utf8');
    fs.mkdirSync(path.join(targetDir, 'urhox-libs'), { recursive: true });

    const status = inspectAiDevKit(targetDir);

    expect(status.ready).toBe(false);
    expect(status.presentEntries).toEqual(['CLAUDE.md', 'urhox-libs']);
    expect(status.missingEntries).toEqual(['examples', 'templates']);
  });

  test('lists present managed dev kit entries beyond required readiness markers', () => {
    fs.mkdirSync(path.join(targetDir, '.emmylua'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'engine-docs'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'examples'), { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'CLAUDE.md'), 'local guide\n', 'utf8');
    fs.writeFileSync(path.join(targetDir, 'user-file.txt'), 'keep me\n', 'utf8');

    expect(listPresentDevKitManagedEntries(targetDir)).toEqual([
      '.emmylua',
      'CLAUDE.md',
      'engine-docs',
      'examples',
    ]);
  });

  test('restores missing dev kit files without overwriting existing local files', async () => {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'CLAUDE.md'), 'user edits\n', 'utf8');

    await installAiDevKit({
      sourceDir,
      targetDir,
      preserveExisting: true,
    });

    expect(fs.readFileSync(path.join(targetDir, 'CLAUDE.md'), 'utf8')).toBe('user edits\n');
    expect(fs.existsSync(path.join(targetDir, 'examples', 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, 'templates', 'README.md'))).toBe(true);
    expect(inspectAiDevKit(targetDir).ready).toBe(true);
  });

  test('stages a managed gitignore block for installed entries before clone', async () => {
    await installAiDevKit({
      sourceDir,
      targetDir,
    });

    expect(fs.existsSync(path.join(targetDir, '.gitignore'))).toBe(false);
    const stagedGitignore = fs.readFileSync(
      path.join(targetDir, DEV_KIT_GITIGNORE_STAGING_FILE),
      'utf8'
    );
    expect(stagedGitignore).toContain('# >>> TapTap Maker AI dev kit (local only) >>>');
    expect(stagedGitignore).toContain('.emmylua/');
    expect(stagedGitignore).toContain('engine-docs/');
    expect(stagedGitignore).toContain('examples/');
    expect(stagedGitignore).toContain('templates/');
    expect(stagedGitignore).toContain('urhox-libs/');
    expect(stagedGitignore).toContain('CLAUDE.md');
    expect(stagedGitignore).not.toContain('scripts/');
    expect(stagedGitignore).not.toContain('ai-dev-kit.zip');
  });

  test('replaces existing managed gitignore block while preserving user rules', () => {
    const gitignorePath = path.join(tempDir, '.gitignore');
    fs.writeFileSync(
      gitignorePath,
      [
        'user-rule.txt',
        createDevKitGitignoreBlock(['old-entry']),
        'another-user-rule.txt',
        '',
      ].join('\n'),
      'utf8'
    );

    mergeDevKitGitignore(gitignorePath, ['engine-docs']);

    const gitignore = fs.readFileSync(gitignorePath, 'utf8');
    expect(gitignore).toContain('user-rule.txt');
    expect(gitignore).toContain('another-user-rule.txt');
    expect(gitignore).toContain('engine-docs/');
    expect(gitignore).not.toContain('old-entry');
  });

  test('always ignores Maker local runtime state in managed gitignore block', () => {
    const block = createDevKitGitignoreBlock(['engine-docs']);

    expect(block).toContain('.maker/');
  });

  describe('resolveDefaultAiDevKitUrl', () => {
    const originalEnv = process.env.TAPTAP_MCP_ENV;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.TAPTAP_MCP_ENV;
      } else {
        process.env.TAPTAP_MCP_ENV = originalEnv;
      }
    });

    test('returns the production URL by default', () => {
      delete process.env.TAPTAP_MCP_ENV;
      expect(resolveDefaultAiDevKitUrl()).toBe(AI_DEV_KIT_URLS.production);
      expect(AI_DEV_KIT_URLS.production).toContain('/pd/stable/');
    });

    test('returns the rnd URL when TAPTAP_MCP_ENV=rnd', () => {
      process.env.TAPTAP_MCP_ENV = 'rnd';
      expect(resolveDefaultAiDevKitUrl()).toBe(AI_DEV_KIT_URLS.rnd);
      expect(AI_DEV_KIT_URLS.rnd).toContain('/rnd/latest/');
    });

    test('explicit environment argument overrides process env', () => {
      process.env.TAPTAP_MCP_ENV = 'production';
      expect(resolveDefaultAiDevKitUrl('rnd')).toBe(AI_DEV_KIT_URLS.rnd);
    });
  });

  test('finalizes staged gitignore after clone and removes staging file', () => {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, '.gitignore'), 'remote-rule.txt\n', 'utf8');
    fs.writeFileSync(
      path.join(targetDir, DEV_KIT_GITIGNORE_STAGING_FILE),
      `${createDevKitGitignoreBlock(['engine-docs'])}\n`,
      'utf8'
    );

    const finalized = finalizeStagedDevKitGitignore(targetDir);

    const gitignore = fs.readFileSync(path.join(targetDir, '.gitignore'), 'utf8');
    expect(finalized).toBe(true);
    expect(gitignore).toContain('remote-rule.txt');
    expect(gitignore).toContain('engine-docs/');
    expect(fs.existsSync(path.join(targetDir, DEV_KIT_GITIGNORE_STAGING_FILE))).toBe(false);
  });
});
