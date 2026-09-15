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
    expect(result.status).toBe(0);
    for (const name of ['MAKER_LOCAL_PREVIEW.md', 'MAKER_CONSOLE.md']) {
      expect(fs.readFileSync(path.join(root, 'packages/maker/docs', name), 'utf8')).toBe(
        fs.readFileSync(path.join(source, 'docs', name), 'utf8')
      );
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
