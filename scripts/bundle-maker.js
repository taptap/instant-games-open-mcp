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
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

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

const optimizedPresetFiles = new Set([
  resolve(projectRoot, 'src/maker/canvas/assetPresetData.json'),
  resolve(projectRoot, 'src/maker/canvas/presetData.json'),
  resolve(projectRoot, 'src/maker/canvas/modelPresetData.json'),
  resolve(projectRoot, 'src/maker/canvas/templateModelData.json'),
]);

function maxPresetImageDimension(assetPath) {
  if (assetPath.includes('merge-icons-item_')) return 120;
  if (assetPath.includes('-item_')) return assetPath.includes('town-npc') ? 320 : 200;
  if (assetPath.includes('character-concept-reference')) return 400;
  if (assetPath.endsWith('.png')) return 500;
  return undefined;
}

function resizeRgba(image, maxDimension) {
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  if (scale === 1) return image;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = ((y + 0.5) * image.height) / height - 0.5;
    const y0 = Math.max(0, Math.floor(sourceY));
    const y1 = Math.min(image.height - 1, y0 + 1);
    const yWeight = sourceY - y0;
    for (let x = 0; x < width; x += 1) {
      const sourceX = ((x + 0.5) * image.width) / width - 0.5;
      const x0 = Math.max(0, Math.floor(sourceX));
      const x1 = Math.min(image.width - 1, x0 + 1);
      const xWeight = sourceX - x0;
      const targetOffset = (y * width + x) * 4;
      const topLeft = (y0 * image.width + x0) * 4;
      const topRight = (y0 * image.width + x1) * 4;
      const bottomLeft = (y1 * image.width + x0) * 4;
      const bottomRight = (y1 * image.width + x1) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const top =
          image.data[topLeft + channel] * (1 - xWeight) + image.data[topRight + channel] * xWeight;
        const bottom =
          image.data[bottomLeft + channel] * (1 - xWeight) +
          image.data[bottomRight + channel] * xWeight;
        data[targetOffset + channel] = Math.round(top * (1 - yWeight) + bottom * yWeight);
      }
    }
  }
  return { width, height, data };
}

function optimizePngData(data, assetPath) {
  const maxDimension = maxPresetImageDimension(assetPath);
  if (!maxDimension) return data;
  const source = PNG.sync.read(Buffer.from(data, 'base64'));
  const image = resizeRgba(source, maxDimension);
  const optimized = PNG.sync.write(image, { deflateLevel: 9, deflateStrategy: 3 });
  return optimized.length < Buffer.byteLength(data, 'base64') ? optimized.toString('base64') : data;
}

function optimizePresetValue(value, assetPath = '') {
  if (Array.isArray(value)) return value.map((item) => optimizePresetValue(item, assetPath));
  if (!value || typeof value !== 'object') return value;
  if (typeof value.data === 'string' && value.type === 'image/png') {
    return { ...value, data: optimizePngData(value.data, assetPath) };
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      const childPath = key === 'data' ? assetPath : key.endsWith('.png') ? key : assetPath;
      if (typeof item === 'string' && key.endsWith('.png')) {
        return [key, optimizePngData(item, key)];
      }
      return [key, optimizePresetValue(item, childPath)];
    })
  );
}

function optimizePresetJsonPlugin() {
  return {
    name: 'optimize-maker-preset-assets',
    setup(build) {
      build.onLoad({ filter: /\.json$/ }, (args) => {
        if (!optimizedPresetFiles.has(resolve(args.path))) return;
        const value = JSON.parse(readFileSync(args.path, 'utf8'));
        return { contents: JSON.stringify(optimizePresetValue(value)), loader: 'json' };
      });
    },
  };
}

try {
  const preview = await esbuild.build({
    entryPoints: [join(projectRoot, 'src/maker/canvas/modelPreviewClient.ts')],
    bundle: true,
    platform: 'browser',
    target: 'es2020',
    format: 'iife',
    write: false,
    minify: true,
    legalComments: 'inline',
  });
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
      __MAKER_MODEL_PREVIEW_SCRIPT__: JSON.stringify(preview.outputFiles[0].text),
      __MAKER_VERSION__: `"${VERSION}"`,
    },
    plugins: [optimizePresetJsonPlugin()],
    minify: false,
    sourcemap: false,
    treeShaking: true,
    preserveSymlinks: true,
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
