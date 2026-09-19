import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

const engine = process.argv[2];
if (!engine || !path.isAbsolute(engine))
  throw new Error('Pass the absolute UrhoX source directory.');
const root = path.join(engine, 'tools/project-tools');
const files = {};
const sourceCommit = execFileSync('git', ['-C', engine, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const rootModules = new Set([
  'project_builder.py',
  'build_context.py',
  'build_pipeline.py',
  'build_types.py',
  'build_utils.py',
  'meta_cache.py',
  'meta_generator.py',
  'path_scanner.py',
  'uuid_generator.py',
  'gpu_cook.py',
  'gpu_texcompress.py',
]);
function isInput(name) {
  const parts = name.split('/');
  return (
    name.endsWith('.py') &&
    (parts.length === 1
      ? rootModules.has(name)
      : parts.slice(0, -1).every((part) => ['build_steps', 'i18n'].includes(part)))
  );
}
function collect(directory) {
  if (fs.lstatSync(directory).isSymbolicLink())
    throw new Error('Builder input directories must not be symbolic links.');
  for (const entry of fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const filename = path.join(directory, entry.name);
    if (
      entry.isSymbolicLink() &&
      (entry.name.endsWith('.py') || ['build_steps', 'i18n'].includes(entry.name))
    )
      throw new Error('Builder inputs must not be symbolic links.');
    if (entry.isDirectory() && ['build_steps', 'i18n'].includes(entry.name)) collect(filename);
    else if (
      entry.isFile() &&
      entry.name.endsWith('.py') &&
      (directory !== root || rootModules.has(entry.name))
    )
      files[path.relative(root, filename).split(path.sep).join('/')] = fs.readFileSync(filename);
  }
}
collect(root);
// Read a fixed Git tree, not the index: untracked/ignored files and index flags must
// never let a working-tree payload masquerade as the recorded commit.
const tree = execFileSync(
  'git',
  ['-C', engine, 'ls-tree', '-rz', sourceCommit, '--', 'tools/project-tools/'],
  { encoding: 'utf8' }
);
const committedFiles = {};
for (const record of tree.split('\0').filter(Boolean).sort()) {
  const separator = record.indexOf('\t');
  const [mode, type, object] = record.slice(0, separator).split(' ');
  const name = record.slice(separator + 1).slice('tools/project-tools/'.length);
  if (!isInput(name)) continue;
  if (type !== 'blob' || !['100644', '100755'].includes(mode))
    throw new Error('Builder inputs must be regular committed files.');
  const content = execFileSync('git', ['-C', engine, 'cat-file', 'blob', object]);
  if (!files[name]?.equals(content))
    throw new Error('Builder inputs have uncommitted changes; refusing ambiguous provenance.');
  const text = content.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(content))
    throw new Error('Builder inputs must be UTF-8 for a byte-reproducible snapshot.');
  committedFiles[name] = text;
}
if (Object.keys(files).some((name) => !Object.hasOwn(committedFiles, name)))
  throw new Error('Builder inputs contain untracked files not present in the source commit.');
if (!Object.hasOwn(committedFiles, 'project_builder.py'))
  throw new Error('Source commit does not contain project_builder.py.');
const payload = gzipSync(Buffer.from(JSON.stringify(committedFiles))).toString('base64');
const digest = createHash('sha256').update(payload).digest('hex');
const output =
  'export const PREVIEW_BUILDER_COMMIT = ' +
  JSON.stringify(sourceCommit) +
  ';\n' +
  'export const PREVIEW_BUILDER_DIGEST = ' +
  JSON.stringify(digest) +
  ';\n' +
  'export const PREVIEW_BUILDER_SOURCE = ' +
  JSON.stringify(payload) +
  ';\n';
const formatted = await format(output, {
  ...(await resolveConfig(fileURLToPath(import.meta.url))),
  parser: 'typescript',
});
fs.writeFileSync('src/maker/preview/builderSource.ts', formatted);
console.log(
  JSON.stringify({
    sourceCommit,
    files: Object.keys(files).length,
    bytes: formatted.length,
    digest,
  })
);
