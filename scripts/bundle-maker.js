#!/usr/bin/env node

/**
 * Bundle TapTap Maker entry into a standalone file.
 *
 * Output: dist/maker.js
 * Usage:
 *   node dist/maker.js
 */

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🚀 Bundling TapTap Maker...');
console.log('📁 Project root:', projectRoot);

const VERSION = process.env.MAKER_PACKAGE_VERSION || 'dev';
console.log('📦 Version:', VERSION);

const outfile = process.env.MAKER_BUNDLE_OUTFILE
  ? resolve(process.env.MAKER_BUNDLE_OUTFILE)
  : join(projectRoot, 'dist', 'maker.js');
const distDir = dirname(outfile);
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

try {
  await esbuild.build({
    entryPoints: [join(projectRoot, 'src/maker/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node16',
    format: 'esm',
    outfile,
    external: [
      'node:*',
      'fs',
      'path',
      'http',
      'https',
      'net',
      'tls',
      'crypto',
      'stream',
      'buffer',
      'util',
      'events',
      'os',
      'url',
      'zlib',
      'querystring',
      'child_process',
      'readline',
      'tty',
      './native/index.js',
    ],
    banner: {
      js: `#!/usr/bin/env node
// TapTap Maker MCP - Standalone Bundle
// TapTap Maker MCP version: ${VERSION}
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const __MAKER_BUNDLE_URL__ = import.meta.url;
`,
    },
    define: {
      __MAKER_VERSION__: `"${VERSION}"`,
    },
    minify: false,
    sourcemap: false,
    treeShaking: true,
    logLevel: 'info',
    charset: 'utf8',
  });

  console.log('✅ Bundle created:', outfile);
  console.log('');
  console.log('📦 Usage:');
  console.log(`  node ${outfile}`);
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
