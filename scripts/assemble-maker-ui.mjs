// Compatibility entry for existing local workflows. The bundled Skill owns assembly.
export * from '../skills/maker-ui-workflow/scripts/assemble-ui.mjs';
import { run } from '../skills/maker-ui-workflow/scripts/assemble-ui.mjs';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length < 5 || process.argv.length > 6)
      throw new Error(
        'Usage: node scripts/assemble-maker-ui.mjs <project> <layout.json> <new-output-dir> [corrections.json]'
      );
    run(...process.argv.slice(2));
  } catch (error) {
    console.error('UI 组装未完成：' + error.message);
    process.exitCode = 1;
  }
}
