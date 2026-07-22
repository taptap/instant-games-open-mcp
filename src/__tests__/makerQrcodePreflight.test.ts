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

  test('requires an explicit orientation selected in a separate conversation turn', () => {
    writeProjectConfig(projectRoot, 'portrait');

    const result = inspectMakerQrcodePreflight(projectRoot, undefined);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('separate conversation turn');
    expect(result.message).toContain('landscape');
    expect(result.message).toContain('portrait');
  });

  test('blocks QR generation when project orientation is missing', () => {
    writeProjectConfig(projectRoot);

    const result = inspectMakerQrcodePreflight(projectRoot, 'portrait');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('taptap_publish.screen_orientation');
    expect(result.message).toContain('maker_build_current_directory');
  });

  test('blocks QR generation when confirmed orientation does not match project config', () => {
    writeProjectConfig(projectRoot, 'landscape');

    const result = inspectMakerQrcodePreflight(projectRoot, 'portrait');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('portrait');
    expect(result.message).toContain('landscape');
  });

  test('allows QR generation when confirmed orientation matches project config', () => {
    writeProjectConfig(projectRoot, 'portrait');

    expect(inspectMakerQrcodePreflight(projectRoot, 'portrait')).toEqual({
      ok: true,
      orientation: 'portrait',
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
