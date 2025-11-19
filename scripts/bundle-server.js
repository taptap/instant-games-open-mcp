#!/usr/bin/env node

/**
 * Bundle MCP Server into a standalone file
 *
 * Output: dist/server-bundle.js (no node_modules required)
 * Usage: node dist/server-bundle.js
 */

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🚀 Bundling MCP Server...');
console.log('📁 Project root:', projectRoot);

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(join(projectRoot, 'package.json'), 'utf-8')
);
const VERSION = packageJson.version;
console.log('📦 Version:', VERSION);

// Ensure dist directory exists
const distDir = join(projectRoot, 'dist');
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

try {
  await esbuild.build({
    entryPoints: [join(projectRoot, 'src/server.ts')],
    bundle: true,
    platform: 'node',
    target: 'node16',
    format: 'esm',
    outfile: join(projectRoot, 'dist/server-bundle.js'),
    external: [
      // Node.js built-ins are always external
      'node:*',
      // External dependencies that might cause issues when bundled
    ],
    banner: {
      js: '// TapTap MCP Server - Standalone Bundle\n'
    },
    // Inject version at build time
    define: {
      '__SERVER_VERSION__': `"${VERSION}"`
    },
    minify: false,  // Keep readable for debugging
    sourcemap: false,
    treeShaking: true,
    logLevel: 'info',
    charset: 'utf8',
  });

  console.log('✅ Bundle created: dist/server-bundle.js');
  console.log('');
  console.log('📦 Usage:');
  console.log('  node dist/server-bundle.js');
  console.log('  TAPTAP_MCP_TRANSPORT=sse node dist/server-bundle.js');
  console.log('');
  console.log('✨ Minimal dependencies required!');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}

