#!/usr/bin/env node

/**
 * Bundle MCP Proxy into a standalone file
 *
 * Output: dist/proxy.js (no node_modules required)
 * Usage: node dist/proxy.js '{"server":{...}}'
 */

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🚀 Bundling MCP Proxy...');
console.log('📁 Project root:', projectRoot);

// Ensure dist directory exists
const distDir = join(projectRoot, 'dist');
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

try {
  await esbuild.build({
    entryPoints: [join(projectRoot, 'src/mcp-proxy/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node16',
    format: 'esm',
    outfile: join(projectRoot, 'dist/proxy.js'),
    external: [],  // Bundle everything (no external dependencies)
    banner: {
      js: '#!/usr/bin/env node\n// TapTap MCP Proxy - Standalone Bundle (no node_modules required)\n'
    },
    minify: false,  // Keep readable for debugging
    sourcemap: false,
    treeShaking: true,
    logLevel: 'info',
    charset: 'utf8',
  });

  console.log('✅ Bundle created: dist/proxy.js');
  console.log('');
  console.log('📦 Usage:');
  console.log('  node dist/proxy.js \'{"server":{"url":"http://..."},"auth":{...}}\'');
  console.log('  echo \'{"server":{...}}\' | node dist/proxy.js');
  console.log('  PROXY_CONFIG=\'{"server":{...}}\' node dist/proxy.js');
  console.log('');
  console.log('✨ No node_modules required!');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
