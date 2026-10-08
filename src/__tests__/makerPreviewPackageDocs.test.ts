import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('shared intent table is contiguous and WorkBuddy describes the same local entry points', () => {
  const source = path.resolve(__dirname, '../..');
  const shared = fs.readFileSync(path.join(source, 'skills/taptap-maker-local/SKILL.md'), 'utf8');
  const table = shared.split('## Main Intent Table\n')[1].split('\n## ')[0].trim();
  expect(table.split('\n').every((line) => line.startsWith('|'))).toBe(true);
  expect(table).toContain('generic code validation');
  const workbuddy = fs.readFileSync(
    path.join(source, 'plugin-sources/taptap-maker/workbuddy/SKILL.md'),
    'utf8'
  );
  expect(workbuddy).toContain('game_url');
  expect(workbuddy).toContain('console open --target-dir');
  expect(workbuddy).toContain('console stop --json');
  expect(workbuddy).not.toContain('macOS Runtime 缺入口');
});

test('npm package includes both local workflow guides in an isolated package', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-preview-package-docs-'));
  const source = path.resolve(__dirname, '../..');
  try {
    for (const entry of [
      'scripts/prepare-maker-package.js',
      'scripts/bundle-maker-ui-skill.js',
      'scripts/maker-demo-resource-check.mjs',
      'skills/maker-ui-workflow',
      'skills/lua-ui-to-json',
      'bin/taptap-maker',
      'skills/taptap-maker-local',
      'skills/taptap-maker-dev-kit-guide',
      'skills/update-taptap-mcp',
      'docs',
      'LICENSE',
    ]) {
      if (!fs.existsSync(path.join(source, entry))) continue;
      fs.mkdirSync(path.dirname(path.join(root, entry)), { recursive: true });
      fs.cpSync(path.join(source, entry), path.join(root, entry), { recursive: true });
    }
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
    // Use the checked resource registry and build dependencies without copying demo media.
    for (const entry of ['node_modules', 'resources', 'src']) {
      fs.symlinkSync(path.join(source, entry), path.join(root, entry), 'junction');
    }
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'dist/maker.js'), '// test bundle');
    const result = spawnSync(
      process.execPath,
      ['scripts/prepare-maker-package.js', '--version', '0.0.1'],
      {
        cwd: root,
        encoding: 'utf8',
      }
    );
    if (result.status !== 0) throw new Error(result.stdout + result.stderr);
    const skill = path.join(root, 'packages/maker/skills/lua-ui-to-json');
    expect(fs.readFileSync(path.join(skill, 'scripts/ui-json-check.cjs'), 'utf8')).toBe(
      fs.readFileSync(
        path.join(source, 'src/maker/uiEditor/web/skills/lua-ui-to-json/scripts/ui-json-check.js'),
        'utf8'
      )
    );
    const game = path.join(root, 'game');
    fs.mkdirSync(path.join(game, 'assets/ui'), { recursive: true });
    const ui = path.join(game, 'assets/ui/page.ui.json');
    const runCheck = () =>
      spawnSync(
        process.execPath,
        [path.join(skill, 'scripts/check-ui.cjs'), '--project', game, '--format', 'json'],
        { cwd: game, encoding: 'utf8' }
      );
    fs.writeFileSync(ui, JSON.stringify({ type: 'Panel', width: 720, height: 1280 }));
    const valid = runCheck();
    expect(valid.stderr).toBe('');
    expect(valid.status).toBe(0);
    expect(JSON.parse(valid.stdout)).toMatchObject({ files: 1, errors: 0 });
    fs.writeFileSync(ui, '{invalid');
    const invalid = runCheck();
    expect(invalid.status).toBe(1);
    expect(JSON.parse(invalid.stdout).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'UI_JSON_PARSE', severity: 'error' }),
      ])
    );
    for (const name of ['MAKER_LOCAL_PREVIEW.md', 'MAKER_CONSOLE.md']) {
      expect(fs.readFileSync(path.join(root, 'packages/maker/docs', name), 'utf8')).toBe(
        fs.readFileSync(path.join(source, 'docs', name), 'utf8')
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
