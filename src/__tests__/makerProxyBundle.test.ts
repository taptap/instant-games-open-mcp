/**
 * Maker embedded proxy command tests.
 */

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
});
