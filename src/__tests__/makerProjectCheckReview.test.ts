import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  collectProjectCheck,
  publishProjectCheck,
  readProjectCheck,
} from '../maker/projectCheck/store';
import { buildAutoAnalysis, runAutoProjectCheck } from '../maker/projectCheck/auto';
import { claimRecoveryMutex } from '../maker/system/recoveryMutex';
import { claimUiSaveLock } from '../maker/uiEditor/saveLock';
import * as architecture from '../maker/projectCheck/architecture';

describe('project check review regressions', () => {
  let temp: string, root: string, dir: string;
  const previousHome = process.env.TAPTAP_MAKER_HOME;
  beforeEach(() => {
    temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'project-check-review-')));
    root = path.join(temp, 'game');
    process.env.TAPTAP_MAKER_HOME = path.join(temp, 'home');
    fs.mkdirSync(path.join(root, '.maker-mcp'), { recursive: true });
    fs.mkdirSync(path.join(root, 'assets'));
    fs.writeFileSync(
      path.join(root, '.maker-mcp/config.json'),
      JSON.stringify({ project_id: 'review' })
    );
    const hash = (text: string) => createHash('sha256').update(text).digest('hex');
    dir = path.join(temp, 'home/project-checks', hash(root), hash('review'));
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (previousHome === undefined) delete process.env.TAPTAP_MAKER_HOME;
    else process.env.TAPTAP_MAKER_HOME = previousHome;
    fs.rmSync(temp, { recursive: true, force: true });
  });

  test('automatic publication rejects a report newer than the confirmed revision', async () => {
    const collected = await collectProjectCheck(root);
    let finishScan!: () => void;
    const scanning = new Promise<void>((resolve) => {
      finishScan = resolve;
    });
    jest.spyOn(architecture, 'inspectArchitecture').mockImplementationOnce(async () => {
      await scanning;
      return collected.facts.architecture;
    });
    const automatic = runAutoProjectCheck(root, 'none');
    await publishProjectCheck(root, {
      ...buildAutoAnalysis(collected),
      auto: false,
      summary: 'AI report',
    });
    const saved = readProjectCheck(root)!;
    finishScan();
    await expect(automatic).rejects.toThrow('发生变化');
    expect(readProjectCheck(root)!.resultRevision).toBe(saved.resultRevision);
    await runAutoProjectCheck(root, saved.resultRevision);
    expect(readProjectCheck(root)!.analysis.auto).toBe(true);
  });

  test('recovers a recorded dead owner, but preserves live and ownerless locks', async () => {
    const pid = await new Promise<number>((resolve, reject) => {
      const child = spawn(process.execPath, ['-e', '']);
      child.once('error', reject);
      child.once('exit', () => resolve(child.pid!));
    });
    const lock = path.join(dir, '.lock');
    fs.mkdirSync(lock, { recursive: true });
    fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid }));
    await collectProjectCheck(root);
    expect(fs.existsSync(lock)).toBe(false);
    fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid }));
    await expect(collectProjectCheck(root)).rejects.toThrow('归属不明');
    expect(fs.existsSync(path.join(lock, 'owner.json'))).toBe(true);
    fs.unlinkSync(path.join(lock, 'owner.json'));
    await expect(collectProjectCheck(root)).rejects.toThrow('归属不明');
    expect(fs.existsSync(lock)).toBe(true);
  });

  test('does not recover while another writer holds the save lock', async () => {
    const release = await claimUiSaveLock(path.join(dir, '.lock.guard'), () => new Error('busy'));
    try {
      await expect(collectProjectCheck(root)).rejects.toThrow('正在保存');
    } finally {
      await release();
    }
    await collectProjectCheck(root);
  });

  test('collects and publishes when the former fixed port is occupied', async () => {
    const release = await claimRecoveryMutex(path.join(dir, '.lock'), () => new Error('busy'));
    try {
      const collected = await collectProjectCheck(root);
      await publishProjectCheck(root, buildAutoAnalysis(collected));
      expect(readProjectCheck(root)!.analysis.auto).toBe(true);
    } finally {
      await release();
    }
  });

  test('media report cache avoids rereads and invalidates on replacement, deletion and rebinding', async () => {
    await runAutoProjectCheck(root, 'none');
    const filename = path.join(dir, 'result.json');
    const read = jest.spyOn(fs, 'readFileSync');
    const first = readProjectCheck(root, true)!;
    for (let i = 0; i < 30; i++) expect(readProjectCheck(root, true)).toBe(first);
    expect(read.mock.calls.filter(([file]) => file === filename)).toHaveLength(1);
    const collected = await collectProjectCheck(root);
    await publishProjectCheck(root, { ...buildAutoAnalysis(collected), summary: 'replacement' });
    expect(readProjectCheck(root, true)!.analysis.summary).toBe('replacement');
    fs.writeFileSync(
      path.join(root, '.maker-mcp/config.json'),
      JSON.stringify({ project_id: 'other' })
    );
    expect(readProjectCheck(root, true)).toBeNull();
    fs.writeFileSync(
      path.join(root, '.maker-mcp/config.json'),
      JSON.stringify({ project_id: 'review' })
    );
    fs.unlinkSync(filename);
    expect(readProjectCheck(root, true)).toBeNull();
  });
});
