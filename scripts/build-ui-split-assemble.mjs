// Bundle maker-ui-workflow's assembler into the ui-split skill so a standalone
// install (ai-dev-kit, without maker-ui-workflow) can still assemble a UI.
// The skill runs outside the repository and has no node_modules, so pngjs is inlined.
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
buildSync({
  entryPoints: [join(root, 'skills/maker-ui-workflow/scripts/assemble-ui.mjs')],
  outfile: join(root, 'skills/ui-split/scripts/assemble-ui.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
console.log('Bundled ui-split/scripts/assemble-ui.mjs');
