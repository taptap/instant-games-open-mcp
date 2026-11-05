import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

// Skill scripts run outside the repository, without its node_modules.
export function bundleMakerUiSkill(projectRoot, skillDirectory) {
  // The library is inlined into the bundled CLI; a copied raw file would import pngjs.
  rmSync(join(skillDirectory, 'scripts/assemble-ui-lib.mjs'), { force: true });
  buildSync({
    entryPoints: [join(projectRoot, 'skills/maker-ui-workflow/scripts/assemble-ui.mjs')],
    outfile: join(skillDirectory, 'scripts/assemble-ui.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
  });
}
