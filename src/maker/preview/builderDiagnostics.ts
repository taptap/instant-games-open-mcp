import fs from 'node:fs';
import path from 'node:path';

type Resource = Record<string, unknown>;

export function previewBuilderWarnings(source: string, stdout: string, stderr = ''): string[] {
  const errors = (stdout + '\n' + stderr).split(/\r?\n/).filter((line) => line.includes('[ERROR]'));
  if (!errors.length) return [];
  const failure = (): never => {
    throw new Error('ProjectBuilder reported an error.');
  };
  const summary = /^\[ERROR\]\s+增强引用错误: (\d+) 个远端路径匹配多个 source，已选择第一个$/.exec(
    errors[0]
  );
  if (
    !summary ||
    Number(summary[1]) < 1 ||
    Number(summary[1]) >= 50 ||
    errors.length !== Number(summary[1]) + 1
  )
    return failure();

  const imports = new Map<string, string[]>();
  for (const line of stdout.split(/\r?\n/)) {
    const imported =
      /^\[INFO\]\s+导入 \d+ 个远端资源: ([\w-]+) \(client=([a-f0-9]+), server=([a-f0-9]+)\)$/.exec(
        line
      );
    if (!imported) continue;
    if (imports.has(imported[1])) return failure();
    imports.set(imported[1], [...new Set(imported.slice(2))]);
  }
  const manifests = new Map<string, Resource[]>();
  const resources = (name: string): Resource[] => {
    if (manifests.has(name)) return manifests.get(name)!;
    const hashes = imports.get(name);
    if (!hashes) return failure();
    const files: Resource[] = [];
    for (const hash of hashes) {
      const filename = path.join(source, '.build', 'manifest_cache', name + '-' + hash + '.json');
      const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
      if (!Array.isArray(manifest.files)) return failure();
      files.push(...manifest.files);
    }
    manifests.set(name, files);
    return files;
  };

  try {
    return errors.slice(1).map((line) => {
      const detail =
        /^\[ERROR\]\s+(.+): multiple sources matched; selected ([\w-]+)=([\w-]+); candidates=(.+)$/.exec(
          line
        );
      if (!detail) return failure();
      const candidates = detail[4].split(', ').map((candidate) => {
        const match = /^([\w-]+)=([\w-]+)$/.exec(candidate);
        if (!match || match[2] !== detail[3]) return failure();
        const files = resources(match[1]).filter(
          (file) => file.fs_path === detail[1] || file.uuid === detail[3]
        );
        if (
          !files.length ||
          files.some((file) => file.uuid !== detail[3] || file.fs_path !== detail[1])
        )
          return failure();
        return { name: match[1], files };
      });
      if (
        candidates.length < 2 ||
        candidates[0].name !== detail[2] ||
        new Set(candidates.map((candidate) => candidate.name)).size !== candidates.length
      )
        return failure();
      const owners = candidates.filter((candidate) =>
        candidate.files.every((file) => file.source === undefined)
      );
      if (owners.length !== 1) return failure();
      const owner = owners[0];
      const canonical = owner.files[0];
      if (
        typeof canonical.hash !== 'string' ||
        !canonical.hash ||
        typeof canonical.ext !== 'string' ||
        !canonical.ext ||
        !Number.isSafeInteger(canonical.size) ||
        Number(canonical.size) < 0
      )
        return failure();
      const identityFields = new Set(['hash', 'size', 'ext']);
      for (const candidate of candidates) {
        for (const file of candidate.files) {
          for (const field of Object.keys(file)) {
            if (field.startsWith('hash@') || field.startsWith('size@')) identityFields.add(field);
          }
        }
      }
      for (const candidate of candidates) {
        for (const file of candidate.files) {
          if (candidate !== owner && file.source !== owner.name) return failure();
          for (const field of identityFields) {
            if (
              (candidate === owner || file[field] !== undefined) &&
              file[field] !== canonical[field]
            )
              return failure();
          }
        }
      }
      return (
        '[WARN] Verified duplicate public resource reference: ' +
        detail[1] +
        ' -> ' +
        owner.name +
        '=' +
        detail[3]
      );
    });
  } catch {
    return failure();
  }
}
