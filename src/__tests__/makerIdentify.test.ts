/**
 * Maker project identification tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findProjectConfig, identifyMakerProject } from '../maker/server/identify';
import { saveProjectConfig } from '../maker/storage';

describe('maker identify', () => {
  let tempDir: string;
  const originalMakerProjectId = process.env.MAKER_PROJECT_ID;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-identify-'));
    delete process.env.MAKER_PROJECT_ID;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (originalMakerProjectId === undefined) {
      delete process.env.MAKER_PROJECT_ID;
    } else {
      process.env.MAKER_PROJECT_ID = originalMakerProjectId;
    }
  });

  test('finds .maker-mcp/config.json from nested cwd', () => {
    saveProjectConfig(tempDir, {
      project_id: 'maker-project-1',
      sce_endpoint: 'https://sce.example.com/mcp',
    });
    const nestedDir = path.join(tempDir, 'src', 'game');
    fs.mkdirSync(nestedDir, { recursive: true });

    const result = findProjectConfig(nestedDir);

    expect(result.source).toBe('cwd');
    expect(result.projectId).toBe('maker-project-1');
    expect(result.projectRoot).toBe(tempDir);
    expect(result.config?.sce_endpoint).toBe('https://sce.example.com/mcp');
  });

  test('prefers explicit project id over environment and cwd', () => {
    process.env.MAKER_PROJECT_ID = 'maker-from-env';
    saveProjectConfig(tempDir, {
      project_id: 'maker-from-cwd',
    });

    const result = identifyMakerProject({
      projectId: 'maker-from-argv',
      cwd: tempDir,
    });

    expect(result.source).toBe('argv');
    expect(result.projectId).toBe('maker-from-argv');
  });

  test('uses environment project id before cwd discovery', () => {
    process.env.MAKER_PROJECT_ID = 'maker-from-env';
    saveProjectConfig(tempDir, {
      project_id: 'maker-from-cwd',
    });

    const result = identifyMakerProject({ cwd: tempDir });

    expect(result.source).toBe('env');
    expect(result.projectId).toBe('maker-from-env');
  });
});
