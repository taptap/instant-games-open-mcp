/**
 * Maker clone binding safety tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cloneMakerProject } from '../maker/cli/projects';
import { saveProjectConfig } from '../maker/storage';

describe('maker clone binding safety', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-clone-binding-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('stops before clone when target is already bound to another Maker project', async () => {
    saveProjectConfig(tempDir, {
      project_id: 'existing-app',
    });

    await expect(
      cloneMakerProject({
        appId: 'new-app',
        targetDir: tempDir,
      })
    ).rejects.toThrow(
      'Please switch to the directory for the existing project, or create/open a new empty directory for the new project.'
    );
  });
});
