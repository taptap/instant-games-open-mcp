/**
 * Maker embedded proxy command tests.
 */

import fs from 'node:fs';
import path from 'node:path';
import { resolveEmbeddedProxyCommand } from '../maker/server/mcp';

describe('maker embedded proxy command', () => {
  test('starts the proxy through the current taptap-maker entry', () => {
    const makerEntry = path.join('/tmp', 'package', 'bin', 'taptap-maker');
    const result = resolveEmbeddedProxyCommand({ makerEntry });

    expect(result).toEqual({
      command: process.execPath,
      args: [makerEntry, '__maker-proxy'],
    });
  });

  test('falls back to the bundled taptap-maker entry when current process has no entry', () => {
    const bundledEntry = path.resolve(__dirname, '../../bin/taptap-maker');
    expect(fs.existsSync(bundledEntry)).toBe(true);

    const result = resolveEmbeddedProxyCommand({ makerEntry: '' });

    expect(result).toEqual({
      command: process.execPath,
      args: [bundledEntry, '__maker-proxy'],
    });
  });
});
