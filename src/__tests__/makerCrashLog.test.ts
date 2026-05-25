import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendMakerCrashLog } from '../maker/crashLog';

describe('maker crash logging', () => {
  let tempDir: string;
  let originalMakerHome: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-crash-log-'));
    originalMakerHome = process.env.TAPTAP_MAKER_HOME;
    process.env.TAPTAP_MAKER_HOME = tempDir;
  });

  afterEach(() => {
    if (originalMakerHome === undefined) {
      delete process.env.TAPTAP_MAKER_HOME;
    } else {
      process.env.TAPTAP_MAKER_HOME = originalMakerHome;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('bounds repeated crash writes and truncates oversized entries', () => {
    const repeatedError = new Error(`boom ${'x'.repeat(2000)}`);

    for (let index = 0; index < 12; index += 1) {
      appendMakerCrashLog('unhandledRejection', repeatedError, {
        maxBytes: 1024,
        maxEntryBytes: 256,
      });
    }

    const logPath = path.join(tempDir, 'mcp-crash.log');
    const rotatedPath = `${logPath}.1`;

    expect(fs.statSync(logPath).size).toBeLessThanOrEqual(1024);
    expect(fs.statSync(rotatedPath).size).toBeLessThanOrEqual(1024);
    expect(fs.readFileSync(logPath, 'utf8')).toContain('truncated');
  });

  test('rotates a preexisting oversized crash log before appending', () => {
    const logPath = path.join(tempDir, 'mcp-crash.log');
    fs.writeFileSync(logPath, 'old crash\n', 'utf8');
    fs.truncateSync(logPath, 4096);

    appendMakerCrashLog('main.catch', new Error('fresh crash'), {
      maxBytes: 1024,
      maxEntryBytes: 512,
    });

    expect(fs.statSync(logPath).size).toBeLessThanOrEqual(1024);
    expect(fs.statSync(`${logPath}.1`).size).toBeLessThanOrEqual(1024);
    expect(fs.readFileSync(logPath, 'utf8')).toContain('fresh crash');
  });
});
