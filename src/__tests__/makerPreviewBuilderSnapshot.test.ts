import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';

const script = path.resolve(__dirname, '../../scripts/snapshot-maker-preview-builder.js');

describe('preview builder snapshot provenance', () => {
  let root: string;
  let engine: string;
  let inputs: string;
  let output: string;
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', engine, ...args], { encoding: 'utf8' }).trim();
  const run = () => spawnSync(process.execPath, [script, engine], { cwd: root, encoding: 'utf8' });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-builder-snapshot-'));
    engine = path.join(root, 'engine');
    inputs = path.join(engine, 'tools/project-tools');
    output = path.join(root, 'src/maker/preview/builderSource.ts');
    fs.mkdirSync(path.join(inputs, 'build_steps'), { recursive: true });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(path.join(inputs, 'project_builder.py'), 'print("builder")\n');
    fs.writeFileSync(path.join(inputs, 'build_steps/step.py'), 'VALUE = 1\n');
    git('init', '-q');
    git('add', '.');
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'fixture'
    );
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test.each(['untracked', 'ignored'])(
    'rejects %s Python inputs without overwriting output',
    (kind) => {
      if (kind === 'ignored') fs.writeFileSync(path.join(engine, '.gitignore'), 'extra.py\n');
      fs.writeFileSync(path.join(inputs, 'build_steps/extra.py'), 'UNREVIEWED = True\n');
      fs.writeFileSync(output, 'existing snapshot');
      const result = run();
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/untracked|not.*commit/i);
      expect(fs.readFileSync(output, 'utf8')).toBe('existing snapshot');
    }
  );

  test.each(['modified', 'deleted', 'staged', 'assume-unchanged'])(
    'rejects %s committed inputs',
    (kind) => {
      const file = path.join(inputs, 'build_steps/step.py');
      if (kind === 'deleted') fs.unlinkSync(file);
      else fs.writeFileSync(file, 'VALUE = 2\n');
      if (kind === 'staged') git('add', '.');
      if (kind === 'assume-unchanged')
        git('update-index', '--assume-unchanged', 'tools/project-tools/build_steps/step.py');
      expect(run().status).not.toBe(0);
    }
  );

  test('records a commit that reproduces every payload byte deterministically', () => {
    expect(run().status).toBe(0);
    const snapshot = fs.readFileSync(output, 'utf8');
    const { commit, payload } = runInNewContext(
      snapshot.replace(/\bexport /g, '') +
        ';({commit: PREVIEW_BUILDER_COMMIT, payload: PREVIEW_BUILDER_SOURCE})'
    );
    expect(commit).toBe(git('rev-parse', 'HEAD'));
    const files = JSON.parse(gunzipSync(Buffer.from(payload, 'base64')).toString('utf8'));
    for (const [name, content] of Object.entries(files)) {
      expect(content).toBe(
        execFileSync('git', ['-C', engine, 'show', `${commit}:tools/project-tools/${name}`], {
          encoding: 'utf8',
        })
      );
    }
    expect(run().status).toBe(0);
    expect(fs.readFileSync(output, 'utf8')).toBe(snapshot);
  });

  test('generates a snapshot that passes repository formatting without a manual rewrite', () => {
    expect(run().status).toBe(0);
    const result = spawnSync(
      process.execPath,
      [
        path.resolve(__dirname, '../../node_modules/prettier/bin/prettier.cjs'),
        '--check',
        '--config',
        path.resolve(__dirname, '../../.prettierrc'),
        output,
      ],
      { encoding: 'utf8' }
    );
    expect(result.status).toBe(0);
  });

  test.each(['file', 'directory'])('rejects a symbolic-link input %s', (kind) => {
    const target = kind === 'file' ? 'build_steps/step.py' : 'build_steps';
    const input = path.join(inputs, target);
    const moved = path.join(root, 'linked-input');
    fs.renameSync(input, moved);
    fs.symlinkSync(moved, input, kind === 'directory' ? 'dir' : 'file');
    expect(run().status).not.toBe(0);
  });

  test('rejects committed non-UTF-8 bytes instead of recording a lossy payload', () => {
    fs.writeFileSync(path.join(inputs, 'build_steps/step.py'), Buffer.from([0xff]));
    git('add', '.');
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'fixture bytes'
    );
    expect(run().status).not.toBe(0);
  });
});
