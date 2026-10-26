// Thin CLI entry. The implementation lives in assemble-ui-lib.mjs so Maker can import it
// without triggering this command-line handler.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { run } from './assemble-ui-lib.mjs';

export * from './assemble-ui-lib.mjs';

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 5 && process.argv.length !== 6)
      throw new Error(
        'Usage: node <skill>/scripts/assemble-ui.mjs <project> <layout.json> <new-output-dir> [corrections.json]'
      );
    console.log(JSON.stringify(run(...process.argv.slice(2))));
  } catch (error) {
    console.error('UI 组装未完成：' + error.message);
    process.exitCode = 1;
  }
}
