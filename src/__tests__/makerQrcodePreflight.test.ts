import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { inspectMakerQrcodePreflight } from '../maker/qrcodePreflight';

describe('Maker QR code orientation preflight', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-qrcode-preflight-'));
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  test('uses the configured orientation without asking the user again', () => {
    writeProjectConfig(projectRoot, 'portrait');

    const result = inspectMakerQrcodePreflight(projectRoot, undefined);

    expect(result).toEqual({ ok: true, orientation: 'portrait' });
  });

  test('asks for orientation only when project orientation is missing', () => {
    writeProjectConfig(projectRoot);

    const result = inspectMakerQrcodePreflight(projectRoot, undefined);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('separate conversation turn');
    expect(result.message).toContain('landscape');
    expect(result.message).toContain('portrait');
  });

  test('stores the user choice when project orientation is missing', () => {
    writeProjectConfig(projectRoot);

    expect(inspectMakerQrcodePreflight(projectRoot, 'portrait')).toEqual({
      ok: true,
      orientation: 'portrait',
    });
    expect(readProjectConfig(projectRoot).taptap_publish).toMatchObject({
      screen_orientation: 'portrait',
    });
  });

  test('keeps the configured orientation when a later confirmation conflicts', () => {
    writeProjectConfig(projectRoot, 'landscape');

    const result = inspectMakerQrcodePreflight(projectRoot, 'portrait');

    expect(result).toEqual({
      ok: true,
      orientation: 'landscape',
    });
    expect(readProjectConfig(projectRoot).taptap_publish).toMatchObject({
      screen_orientation: 'landscape',
    });
  });
});

function writeProjectConfig(projectRoot: string, screenOrientation?: string): void {
  const projectDir = path.join(projectRoot, '.project');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, 'project.json'),
    JSON.stringify({
      project_id: 'p_test',
      taptap_publish: {
        title: 'Test game',
        category: 'casual',
        ...(screenOrientation ? { screen_orientation: screenOrientation } : {}),
      },
    })
  );
}

function readProjectConfig(projectRoot: string): Record<string, any> {
  return JSON.parse(
    fs.readFileSync(path.join(projectRoot, '.project', 'project.json'), 'utf8')
  ) as Record<string, any>;
}
