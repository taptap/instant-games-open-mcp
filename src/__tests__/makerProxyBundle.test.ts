/**
 * Maker proxy bundle resolution tests.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveLocalProxyBundle } from '../maker/server/mcp';

describe('maker proxy bundle resolution', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-proxy-bundle-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('resolves proxy next to bundled maker even when cwd is a Maker game project', () => {
    const packageDistDir = path.join(tempDir, 'node_modules', 'pkg', 'dist');
    const gameDir = path.join(tempDir, 'game-project');
    fs.mkdirSync(packageDistDir, { recursive: true });
    fs.mkdirSync(gameDir, { recursive: true });
    const makerBundle = path.join(packageDistDir, 'maker.js');
    const proxyBundle = path.join(packageDistDir, 'proxy.js');
    fs.writeFileSync(makerBundle, 'console.log("maker");\n', 'utf8');
    fs.writeFileSync(proxyBundle, 'console.log("proxy");\n', 'utf8');

    const result = resolveLocalProxyBundle({
      currentModuleUrl: pathToFileURL(makerBundle).href,
      makerEntry: path.join(gameDir, 'node_modules', '.bin', 'taptap-maker'),
      cwd: gameDir,
    });

    expect(result).toBe(proxyBundle);
  });

  test('resolves package dist proxy when maker is started through npm bin entry', () => {
    const binDir = path.join(tempDir, 'bin');
    const distDir = path.join(tempDir, 'dist');
    const gameDir = path.join(tempDir, 'game-project');
    fs.mkdirSync(binDir, { recursive: true });
    fs.mkdirSync(distDir, { recursive: true });
    fs.mkdirSync(gameDir, { recursive: true });
    const makerEntry = path.join(binDir, 'taptap-maker');
    const makerBundle = path.join(tempDir, 'missing-dist', 'maker.js');
    const proxyBundle = path.join(distDir, 'proxy.js');
    fs.writeFileSync(makerEntry, '#!/usr/bin/env node\n', 'utf8');
    fs.writeFileSync(proxyBundle, 'console.log("proxy");\n', 'utf8');

    const result = resolveLocalProxyBundle({
      currentModuleUrl: pathToFileURL(makerBundle).href,
      makerEntry,
      cwd: gameDir,
    });

    expect(result).toBe(proxyBundle);
  });
});
