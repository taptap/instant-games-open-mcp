#!/usr/bin/env node

/**
 * Bundle MCP Server into a standalone file
 *
 * Output:
 *   dist/server.js        - Main bundle (no node_modules required)
 *   dist/native/          - Native signer binaries
 *   dist/native/index.js  - Native loader
 *
 * Usage: node dist/server.js
 */

import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, readdirSync, copyFileSync, writeFileSync } from 'node:fs';

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
const distNativeDir = join(distDir, 'native');
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}
if (!existsSync(distNativeDir)) {
  mkdirSync(distNativeDir, { recursive: true });
}

// Copy native signer files to dist/native/
const nativeDir = join(projectRoot, 'native');
if (existsSync(nativeDir)) {
  // Copy index.d.ts as-is
  const dtsPath = join(nativeDir, 'index.d.ts');
  if (existsSync(dtsPath)) {
    copyFileSync(dtsPath, join(distNativeDir, 'index.d.ts'));
  }

  // Copy and patch index.js to fix __dirname issue in ESM context
  // When ESM dynamically imports CJS, __dirname may resolve to '.' instead of actual path
  const indexPath = join(nativeDir, 'index.js');
  if (existsSync(indexPath)) {
    let indexContent = readFileSync(indexPath, 'utf8');

    // Patch index.js to fix __dirname issue
    // When ESM dynamically imports CJS, __dirname may be '.' instead of actual path
    // Use module.filename which is reliable in CJS context
    indexContent = indexContent.replace(
      "const { join } = require('path')",
      "const { join, dirname: pathDirname } = require('path')"
    );

    // Insert fix code after the initial requires
    // Use module.filename as the primary source for directory resolution
    indexContent = indexContent.replace(
      'let nativeBinding = null',
      `// Fix __dirname for ESM dynamic import compatibility
// Use module.filename which is set correctly when CJS is dynamically imported from ESM
const __dirnameFixed = (typeof __dirname !== 'undefined' && __dirname !== '.' && __dirname !== '')
  ? __dirname
  : (typeof module !== 'undefined' && module.filename)
    ? pathDirname(module.filename)
    : (typeof __filename !== 'undefined' && __filename !== '')
      ? pathDirname(__filename)
      : process.cwd();

let nativeBinding = null`
    );

    // Replace __dirname with __dirnameFixed
    indexContent = indexContent.replace(/join\(__dirname,/g, 'join(__dirnameFixed,');

    // Replace require('./taptap-signer.xxx.node') with require(join(__dirnameFixed, 'taptap-signer.xxx.node'))
    // This fixes the issue where require() uses cwd instead of the module's directory
    indexContent = indexContent.replace(
      /require\('\.\/taptap-signer\.([^']+)\.node'\)/g,
      "require(join(__dirnameFixed, 'taptap-signer.$1.node'))"
    );

    writeFileSync(join(distNativeDir, 'index.js'), indexContent);

    // Add package.json to force CommonJS mode (root package.json has "type": "module")
    writeFileSync(join(distNativeDir, 'package.json'), JSON.stringify({
      "type": "commonjs"
    }, null, 2));

    console.log('📦 Native signer: index.js patched for ESM compatibility');
  }

  // Copy all .node binaries
  const nodeFiles = readdirSync(nativeDir).filter(f => f.endsWith('.node'));
  for (const file of nodeFiles) {
    const src = join(nativeDir, file);
    const dest = join(distNativeDir, file);
    copyFileSync(src, dest);
  }

  console.log(`📦 Native signer: ${nodeFiles.length} binaries copied to dist/native/`);
} else {
  console.log('⚠️  Native signer not found, skipping...');
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
      'child_process', 'readline', 'tty',
      // Native signer module (loaded at runtime from dist/native/)
      './native/index.js',
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

