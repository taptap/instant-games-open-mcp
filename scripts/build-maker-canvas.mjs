import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
execFileSync(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'packages/maker-canvas/tsconfig.build.json'],
  { cwd: root, stdio: 'inherit' }
);
await build({
  absWorkingDir: root,
  entryPoints: [
    'packages/maker-canvas/src/browser.ts',
    'packages/maker-canvas/src/domain.ts',
    'packages/maker-canvas/src/contracts.ts',
  ],
  outdir: 'packages/maker-canvas/dist',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  splitting: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2020',
  // The existing page serializes functions; their names are part of its assembly contract.
  keepNames: true,
  minify: false,
});
