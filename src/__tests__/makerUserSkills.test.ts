import archiver from 'archiver';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import { pullMakerUserSkills, validateUserSkillArchivePath } from '../maker/cli/userSkills';

describe('Maker user Skill pull', () => {
  const originalMakerHome = process.env.TAPTAP_MAKER_HOME;
  const originalApiBase = process.env.TAPTAP_MAKER_API_BASE;
  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-user-skills-'));
    projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(path.join(projectDir, '.maker-mcp'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.maker-mcp', 'config.json'),
      JSON.stringify({ project_id: 'project-1' }),
      'utf8'
    );
    process.env.TAPTAP_MAKER_HOME = path.join(tempDir, 'maker-home');
    process.env.TAPTAP_MAKER_API_BASE = 'https://maker.example/api/v1';
    fs.mkdirSync(process.env.TAPTAP_MAKER_HOME, { recursive: true });
    fs.writeFileSync(
      path.join(process.env.TAPTAP_MAKER_HOME, 'pat.json'),
      JSON.stringify({ token: 'test-pat' }),
      'utf8'
    );
  });

  afterEach(() => {
    restoreEnv('TAPTAP_MAKER_HOME', originalMakerHome);
    restoreEnv('TAPTAP_MAKER_API_BASE', originalApiBase);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('downloads and replaces included Skills while preserving other local Skills', async () => {
    addLocalSkill('materials', 'old materials');
    addLocalSkill('local-only', 'keep me');
    addClientSkill('.codex', 'codex-only', 'keep codex');
    addClientSkill('.cursor', 'materials', 'stale cursor copy');
    addClientSkill('.workbuddy', 'workbuddy-only', 'keep workbuddy');
    const zip = await createZip({
      'materials/SKILL.md': '# new materials\n',
      'materials/references/guide.md': 'new guide\n',
      'ui-helper/SKILL.md': '# ui helper\n',
    });
    const fetchImpl = jest.fn(async () => zipResponse(zip)) as jest.MockedFunction<typeof fetch>;

    const result = await pullMakerUserSkills({ targetDir: projectDir, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://maker.example/api/v1/user/skills/archive',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: 'application/zip',
          Authorization: 'Bearer test-pat',
        },
      })
    );
    expect(result.installedSkills).toEqual(['materials', 'ui-helper']);
    expect(result.preservedSkills).toEqual(['local-only']);
    expect(
      fs.readFileSync(
        path.join(projectDir, '.installer', 'skills', 'materials', 'SKILL.md'),
        'utf8'
      )
    ).toBe('# new materials\n');
    expect(
      fs.readFileSync(
        path.join(projectDir, '.installer', 'skills', 'materials', 'references', 'guide.md'),
        'utf8'
      )
    ).toBe('new guide\n');
    expect(
      fs.readFileSync(
        path.join(projectDir, '.installer', 'skills', 'local-only', 'SKILL.md'),
        'utf8'
      )
    ).toContain('keep me');

    for (const clientDir of ['.codex', '.cursor', '.workbuddy']) {
      expect(
        fs.readFileSync(path.join(projectDir, clientDir, 'skills', 'materials', 'SKILL.md'), 'utf8')
      ).toBe('# new materials\n');
      expect(
        fs.readFileSync(path.join(projectDir, clientDir, 'skills', 'ui-helper', 'SKILL.md'), 'utf8')
      ).toBe('# ui helper\n');
    }
    expect(
      fs.readFileSync(path.join(projectDir, '.codex', 'skills', 'codex-only', 'SKILL.md'), 'utf8')
    ).toContain('keep codex');
    expect(
      fs.readFileSync(
        path.join(projectDir, '.workbuddy', 'skills', 'workbuddy-only', 'SKILL.md'),
        'utf8'
      )
    ).toContain('keep workbuddy');
  });

  test('rejects an archive without SKILL.md before changing existing Skills', async () => {
    addLocalSkill('materials', 'old materials');
    const zip = await createZip({ 'materials/README.md': 'missing definition\n' });

    await expect(
      pullMakerUserSkills({
        targetDir: projectDir,
        fetchImpl: (async () => zipResponse(zip)) as typeof fetch,
      })
    ).rejects.toThrow('SKILL.md');

    expect(
      fs.readFileSync(
        path.join(projectDir, '.installer', 'skills', 'materials', 'SKILL.md'),
        'utf8'
      )
    ).toContain('old materials');
  });

  test('accepts an empty ZIP without deleting local Skills', async () => {
    addLocalSkill('local-only', 'keep me');
    const zip = await createZip({});

    const result = await pullMakerUserSkills({
      targetDir: projectDir,
      fetchImpl: (async () => zipResponse(zip)) as typeof fetch,
    });

    expect(result.installedSkills).toEqual([]);
    expect(result.preservedSkills).toEqual(['local-only']);
    expect(
      fs.readFileSync(
        path.join(projectDir, '.installer', 'skills', 'local-only', 'SKILL.md'),
        'utf8'
      )
    ).toContain('keep me');
  });

  test.each(['../escape/SKILL.md', '/absolute/SKILL.md', 'skill/../escape.md'])(
    'rejects unsafe archive path %s',
    (entryPath) => {
      expect(() => validateUserSkillArchivePath(entryPath)).toThrow('unsafe');
    }
  );

  function addLocalSkill(name: string, body: string): void {
    const skillDir = path.join(projectDir, '.installer', 'skills', name);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `# ${name}\n\n${body}\n`, 'utf8');
  }

  function addClientSkill(clientDir: string, name: string, body: string): void {
    const skillDir = path.join(projectDir, clientDir, 'skills', name);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `# ${name}\n\n${body}\n`, 'utf8');
  }
});

async function createZip(entries: Record<string, string>): Promise<Buffer> {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on('data', (chunk: Buffer) => chunks.push(chunk));
  archive.pipe(output);
  for (const [name, content] of Object.entries(entries)) {
    archive.append(content, { name });
  }
  const completed = new Promise<Buffer>((resolve, reject) => {
    output.on('end', () => resolve(Buffer.concat(chunks)));
    output.on('error', reject);
    archive.on('error', reject);
  });
  await archive.finalize();
  return completed;
}

function zipResponse(zip: Buffer): Response {
  return new Response(new Uint8Array(zip), {
    status: 200,
    headers: { 'Content-Type': 'application/zip' },
  });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
