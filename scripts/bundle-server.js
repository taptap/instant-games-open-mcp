#!/usr/bin/env node

/**
 * Bundle MCP Server into a standalone file
 *
 * Output: dist/server.js (no node_modules required)
 * Usage: node dist/server.js
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
    outfile: join(projectRoot, 'dist/server.js'),
    // Bundle everything except Node.js built-ins
    // This creates a true standalone bundle with zero npm dependencies
    external: [
      'node:*',
      // Only externalize Node.js core modules
      'fs', 'path', 'http', 'https', 'net', 'tls', 'crypto', 'stream',
      'buffer', 'util', 'events', 'os', 'url', 'zlib', 'querystring',
      'child_process', 'readline', 'tty'
    ],
    banner: {
      js: `// TapTap MCP Server - Standalone Bundle
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
`
    },
    // Inject version at build time
    // __VERSION__ serves dual purpose:
    // 1. Provides version string for the application
    // 2. Signals bundle mode (disables dotenv, package.json reading)
    define: {
      '__VERSION__': `"${VERSION}"`
    },
    minify: true,  // Enable minification for smaller size
    sourcemap: false,
    treeShaking: true,
    logLevel: 'info',
    charset: 'utf8',
  });

  console.log('✅ Bundle created: dist/server.js');
  console.log('');
  console.log('📦 Usage:');
  console.log('  node dist/server.js');
  console.log('  TAPTAP_MCP_TRANSPORT=sse node dist/server.js');
  console.log('');
  console.log('✨ Zero runtime dependencies!');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}

