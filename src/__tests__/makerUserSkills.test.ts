import archiver from 'archiver';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';

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

  test('restores every client Skill when a later client installation fails', async () => {
    addLocalSkill('materials', 'old source');
    for (const clientDir of ['.codex', '.cursor', '.workbuddy']) {
      addClientSkill(clientDir, 'materials', `old ${clientDir}`);
    }
    const zip = await createZip({ 'materials/SKILL.md': '# new materials\n' });
    const originalSymlinkSync = fs.symlinkSync;
    const originalCpSync = fs.cpSync;
    const failingTarget = path.join(projectDir, '.cursor', 'skills', 'materials');
    const symlinkSpy = jest.spyOn(fs, 'symlinkSync').mockImplementation((source, target, type) => {
      if (path.resolve(String(target)) === failingTarget) {
        throw Object.assign(new Error('simulated symlink failure'), { code: 'EACCES' });
      }
      return originalSymlinkSync(source, target, type);
    });
    const copySpy = jest.spyOn(fs, 'cpSync').mockImplementation((source, target, options) => {
      if (path.resolve(String(target)) === failingTarget) {
        throw Object.assign(new Error('simulated copy failure'), { code: 'ENOSPC' });
      }
      return originalCpSync(source, target, options);
    });

    try {
      await expect(
        pullMakerUserSkills({
          targetDir: projectDir,
          fetchImpl: (async () => zipResponse(zip)) as typeof fetch,
        })
      ).rejects.toThrow('Failed to install Maker user Skills for AI clients');
    } finally {
      symlinkSpy.mockRestore();
      copySpy.mockRestore();
    }

    for (const clientDir of ['.codex', '.cursor', '.workbuddy']) {
      expect(
        fs.readFileSync(path.join(projectDir, clientDir, 'skills', 'materials', 'SKILL.md'), 'utf8')
      ).toContain(`old ${clientDir}`);
    }
    expect(
      fs.readFileSync(
        path.join(projectDir, '.installer', 'skills', 'materials', 'SKILL.md'),
        'utf8'
      )
    ).toContain('old source');
  });

  test('preserves source and client backups when rollback fails', async () => {
    addLocalSkill('materials', 'old source');
    for (const clientDir of ['.codex', '.cursor', '.workbuddy']) {
      addClientSkill(clientDir, 'materials', `old ${clientDir}`);
    }
    const zip = await createZip({ 'materials/SKILL.md': '# new materials\n' });
    const originalSymlinkSync = fs.symlinkSync;
    const originalCpSync = fs.cpSync;
    const originalRenameSync = fs.renameSync;
    const failingClientTarget = path.join(projectDir, '.cursor', 'skills', 'materials');
    const sourceTarget = path.join(projectDir, '.installer', 'skills', 'materials');
    const symlinkSpy = jest.spyOn(fs, 'symlinkSync').mockImplementation((source, target, type) => {
      if (path.resolve(String(target)) === failingClientTarget) {
        throw Object.assign(new Error('simulated symlink failure'), { code: 'EACCES' });
      }
      return originalSymlinkSync(source, target, type);
    });
    const copySpy = jest.spyOn(fs, 'cpSync').mockImplementation((source, target, options) => {
      if (path.resolve(String(target)) === failingClientTarget) {
        throw Object.assign(new Error('simulated copy failure'), { code: 'ENOSPC' });
      }
      return originalCpSync(source, target, options);
    });
    const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      const sourcePath = String(source);
      const targetPath = path.resolve(String(target));
      const isBackupRestore = sourcePath.includes(`${path.sep}backup${path.sep}`);
      if (
        isBackupRestore &&
        sourcePath.includes('.user-skill-clients-') &&
        targetPath === failingClientTarget
      ) {
        throw Object.assign(new Error('simulated client rollback failure'), { code: 'EACCES' });
      }
      if (isBackupRestore && sourcePath.includes('.user-skills-') && targetPath === sourceTarget) {
        throw Object.assign(new Error('simulated source rollback failure'), { code: 'EBUSY' });
      }
      return originalRenameSync(source, target);
    });

    try {
      await expect(
        pullMakerUserSkills({
          targetDir: projectDir,
          fetchImpl: (async () => zipResponse(zip)) as typeof fetch,
        })
      ).rejects.toThrow('backups were preserved');
    } finally {
      symlinkSpy.mockRestore();
      copySpy.mockRestore();
      renameSpy.mockRestore();
    }

    const sourceTransactionDir = findInstallerTransaction('.user-skills-');
    expect(
      fs.readFileSync(path.join(sourceTransactionDir, 'backup', 'materials', 'SKILL.md'), 'utf8')
    ).toContain('old source');
    const clientTransactionDir = findInstallerTransaction('.user-skill-clients-');
    expect(
      fs.readFileSync(
        path.join(clientTransactionDir, 'backup', '.cursor', 'materials', 'SKILL.md'),
        'utf8'
      )
    ).toContain('old .cursor');
  });

  test('rejects a download whose declared size exceeds the archive limit', async () => {
    const response = new Response(new Uint8Array([1]), {
      status: 200,
      headers: { 'Content-Length': String(64 * 1024 * 1024 + 1) },
    });

    await expect(
      pullMakerUserSkills({
        targetDir: projectDir,
        fetchImpl: (async () => response) as typeof fetch,
      })
    ).rejects.toThrow('64 MiB');
  });

  test('stops a streamed download that exceeds the archive limit without a size header', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let emittedChunks = 0;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (emittedChunks >= 65) {
            controller.close();
            return;
          }
          emittedChunks += 1;
          controller.enqueue(chunk);
        },
      }),
      { status: 200 }
    );

    await expect(
      pullMakerUserSkills({
        targetDir: projectDir,
        fetchImpl: (async () => response) as typeof fetch,
      })
    ).rejects.toThrow('64 MiB');
  });

  test('rejects an archive with more than 1000 entries', async () => {
    const entries: Record<string, string> = { 'bulk/SKILL.md': '# bulk\n' };
    for (let index = 0; index < 1000; index += 1) {
      entries[`bulk/references/${index}.md`] = '';
    }
    const zip = await createZip(entries);

    await expect(
      pullMakerUserSkills({
        targetDir: projectDir,
        fetchImpl: (async () => zipResponse(zip)) as typeof fetch,
      })
    ).rejects.toThrow('1000 entries');
  });

  test('rejects an archive larger than 128 MiB after extraction', async () => {
    const zip = await createRepeatedZip('large/SKILL.md', 129 * 1024 * 1024);

    await expect(
      pullMakerUserSkills({
        targetDir: projectDir,
        fetchImpl: (async () => zipResponse(zip)) as typeof fetch,
      })
    ).rejects.toThrow('128 MiB');
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

  function findInstallerTransaction(prefix: string): string {
    const installerDir = path.join(projectDir, '.installer');
    const entries = fs.readdirSync(installerDir).filter((entry) => entry.startsWith(prefix));
    expect(entries).toHaveLength(1);
    return path.join(installerDir, entries[0]);
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

async function createRepeatedZip(entryName: string, size: number): Promise<Buffer> {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const output = new PassThrough();
  const chunks: Buffer[] = [];
  output.on('data', (chunk: Buffer) => chunks.push(chunk));
  archive.pipe(output);
  const chunk = Buffer.alloc(1024 * 1024);
  archive.append(
    Readable.from(
      (function* (): Generator<Buffer> {
        for (let emitted = 0; emitted < size; emitted += chunk.length) {
          yield chunk.subarray(0, Math.min(chunk.length, size - emitted));
        }
      })()
    ),
    { name: entryName }
  );
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
