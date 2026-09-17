import fs from 'node:fs';
import path from 'node:path';
import { ConsoleProjects } from './projects.js';

const EXCLUDED = new Set([
  '.git',
  'node_modules',
  '.installer',
  '.maker-mcp',
  '.project',
  '.venv',
  'venv',
  '__pycache__',
  'Library',
  '$RECYCLE.BIN',
  'System Volume Information',
]);

export async function discoverConsoleProjects(directory: string, registry: ConsoleProjects) {
  const root = await fs.promises.realpath(directory);
  const known = new Set(registry.list().map((project) => project.path));
  const result = { added: 0, existing: 0, skipped: 0, limited: false };
  const deadline = Date.now() + 10_000;
  let visited = 0;
  const queue = [{ directory: root, depth: 0 }];
  while (queue.length) {
    if (visited >= 5000 || Date.now() >= deadline || result.added + result.existing >= 200) {
      result.limited = true;
      break;
    }
    const current = queue.shift()!;
    visited++;
    const marker = path.join(current.directory, '.maker-mcp/config.json');
    if (
      fs.existsSync(marker) ||
      fs.existsSync(path.join(current.directory, '.project/project.json'))
    ) {
      try {
        // Registration remains the authority for project binding and duplicate validation.
        const project = registry.add(current.directory);
        if (known.has(project.path)) result.existing++;
        else {
          known.add(project.path);
          result.added++;
        }
        continue;
      } catch {
        result.skipped++;
      }
    }
    try {
      const entries = await fs.promises.opendir(current.directory);
      for await (const entry of entries) {
        if (++visited >= 5000 || Date.now() >= deadline) {
          result.limited = true;
          break;
        }
        if (!entry.isDirectory() || entry.isSymbolicLink() || EXCLUDED.has(entry.name)) continue;
        if (current.depth >= 8) {
          result.limited = true;
          continue;
        }
        queue.push({
          directory: path.join(current.directory, entry.name),
          depth: current.depth + 1,
        });
      }
    } catch {
      result.skipped++;
    }
  }
  return result;
}
