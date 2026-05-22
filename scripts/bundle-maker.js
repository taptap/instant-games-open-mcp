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
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🚀 Bundling TapTap Maker...');
console.log('📁 Project root:', projectRoot);

const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'));
const VERSION = packageJson.version;
console.log('📦 Version:', VERSION);

const distDir = join(projectRoot, 'dist');
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
    outfile: join(projectRoot, 'dist/maker.js'),
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

  console.log('✅ Bundle created: dist/maker.js');
  console.log('');
  console.log('📦 Usage:');
  console.log('  node dist/maker.js');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
