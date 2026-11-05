import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { previewProject } from '../preview/protocol.js';
import { getMakerHome, loadProjectConfig } from '../storage.js';
import { writePrivateJson } from '../system/privateJson.js';
import { claimRecoveryMutex } from '../system/recoveryMutex.js';
import { processPresence } from '../system/processPresence.js';
import { inspectAssets } from './assets.js';
import { inspectArchitecture } from './architecture.js';
import { isLocalCanvasImagePath } from '../canvas/localMediaValidation.js';
import { parseAnalysis, type Analysis, type Evidence } from './schema.js';

const MAX_RESULT_BYTES = 32 * 1024 * 1024;
type Identity = { root: string; binding: string };
type Facts = {
  identity: Identity;
  collectedAt: string;
  assets: Awaited<ReturnType<typeof inspectAssets>>;
  architecture: Awaited<ReturnType<typeof inspectArchitecture>>;
};
type Published = { schema: 1; publishedAt: string; facts: Facts; analysis: Analysis };
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

function assetHash(filename: string, expectedBytes: number): string {
  const fd = fs.openSync(filename, 'r');
  try {
    const digest = createHash('sha256');
    const buffer = Buffer.alloc(64 * 1024);
    let size = 0;
    while (size < expectedBytes) {
      const count = fs.readSync(fd, buffer, 0, Math.min(buffer.length, expectedBytes - size), size);
      if (!count) throw new Error('素材读取期间发生变化，请重新 collect。');
      digest.update(buffer.subarray(0, count));
      size += count;
    }
    if (fs.fstatSync(fd).size !== expectedBytes)
      throw new Error('素材读取期间发生变化，请重新 collect。');
    return digest.digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}

function identity(targetDir: string): Identity {
  const root = previewProject(targetDir);
  const binding = loadProjectConfig(root)?.project_id;
  if (typeof binding !== 'string' || !binding.trim())
    throw new Error('项目尚未绑定 Maker project_id。');
  return { root, binding };
}
function directory(project: Identity): string {
  return path.join(getMakerHome(), 'project-checks', hash(project.root), hash(project.binding));
}
function sameIdentity(actual: Identity, expected: Identity) {
  if (actual?.root !== expected.root || actual?.binding !== expected.binding)
    throw new Error('项目目录或绑定发生变化，请重新收集检查依据。');
}
function readJson<T>(filename: string): { value: T; revision: string } | null {
  try {
    const stat = fs.lstatSync(filename);
    if (!stat.isFile() || stat.size > MAX_RESULT_BYTES)
      throw new Error('检查结果文件无效或超过 32 MiB。');
    const text = fs.readFileSync(filename, 'utf8');
    if (Buffer.byteLength(text) > MAX_RESULT_BYTES) throw new Error('检查结果超过 32 MiB。');
    return { value: JSON.parse(text) as T, revision: hash(text) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
function writeJson(filename: string, value: unknown) {
  if (Buffer.byteLength(JSON.stringify(value, null, 2)) > MAX_RESULT_BYTES)
    throw new Error('检查结果超过 32 MiB，原结果未改动。');
  writePrivateJson(filename, value);
}
async function withLock<T>(project: Identity, action: () => T): Promise<T> {
  const dir = directory(project);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const lock = path.join(dir, '.lock');
  const release = await claimRecoveryMutex(
    lock,
    () => new Error('另一个项目检查正在保存，请稍后重试。')
  );
  let owned = false;
  try {
    if (fs.existsSync(lock)) {
      const owner = readJson<{ pid: number }>(path.join(lock, 'owner.json'));
      if (!owner || processPresence(owner.value.pid) !== 'missing')
        throw new Error(
          '项目检查锁仍被占用或归属不明；请确认保存进程已退出后再移除锁目录：' + lock
        );
      fs.unlinkSync(path.join(lock, 'owner.json'));
      fs.rmdirSync(lock);
    }
    fs.mkdirSync(lock, { mode: 0o700 });
    owned = true;
    writePrivateJson(path.join(lock, 'owner.json'), { pid: process.pid });
    sameIdentity(identity(project.root), project);
    return action();
  } finally {
    try {
      if (owned) {
        fs.rmSync(path.join(lock, 'owner.json'), { force: true });
        fs.rmdirSync(lock);
      }
    } finally {
      await release();
    }
  }
}

/** CLI-only collection. A new snapshot never replaces the published report. */
export async function collectProjectCheck(targetDir: string) {
  const project = identity(targetDir);
  const [assets, architecture] = await Promise.all([
    inspectAssets(project.root),
    inspectArchitecture(project.root),
  ]);
  const facts: Facts = {
    identity: project,
    collectedAt: new Date().toISOString(),
    assets,
    architecture,
  };
  return withLock(project, () => {
    const dir = directory(project);
    writeJson(path.join(dir, 'facts.json'), facts);
    return {
      factsRevision: readJson<Facts>(path.join(dir, 'facts.json'))!.revision,
      resultRevision: readJson<Published>(path.join(dir, 'result.json'))?.revision ?? 'none',
      facts,
    };
  });
}

function localPath(root: string, relative: string): string {
  if (
    !relative ||
    relative.includes(String.fromCharCode(92)) ||
    relative.split('/').some((part) => !part || part === '.' || part === '..') ||
    path.isAbsolute(relative)
  )
    throw new Error('依据必须使用项目内的规范相对路径：' + relative);
  const filename = path.join(root, relative);
  if (!filename.startsWith(root + path.sep) || fs.realpathSync.native(filename) !== filename)
    throw new Error('依据路径越界或包含链接：' + relative);
  return filename;
}

function validateEvidence(facts: Facts, analysis: Analysis) {
  const sources = new Map(facts.architecture.files.map((file) => [file.path, file]));
  const assigned = new Set<string>();
  for (const module of analysis.modules) {
    if (!module.files.length) throw new Error('模块需要至少一个已收集源码文件。');
    for (const file of module.files) {
      if (!sources.has(file) || assigned.has(file)) throw new Error('模块文件未知或重复：' + file);
      assigned.add(file);
    }
  }
  if (assigned.size !== sources.size) throw new Error('每个已收集 Lua 文件必须归入一个模块。');
  // Refuse stale line evidence even if another process edits code during AI analysis.
  for (const file of sources.values()) {
    const filename = localPath(facts.identity.root, file.path);
    const stat = fs.statSync(filename);
    if (
      !stat.isFile() ||
      stat.size !== file.bytes ||
      stat.size > 3 * 1024 * 1024 ||
      hash(fs.readFileSync(filename)) !== file.sha256
    )
      throw new Error('源码已变化，请重新 collect 并复核分析：' + file.path);
  }
  if (analysis.organization) {
    if (!facts.assets.sourceRevisions) throw new Error('分类报告需要新版 collect 依据。');
    for (const file of facts.assets.sourceRevisions) {
      const filename = localPath(facts.identity.root, file.path);
      const stat = fs.statSync(filename);
      if (
        !stat.isFile() ||
        stat.size !== file.bytes ||
        stat.size > 4 * 1024 * 1024 ||
        hash(fs.readFileSync(filename, 'utf8')) !== file.sha256
      )
        throw new Error('素材引用依据已变化，请重新 collect：' + file.path);
    }
    const assets = new Map(facts.assets.assets.map((asset) => [asset.path, asset]));
    const targets = new Set<string>();
    for (const item of analysis.organization.items) {
      const asset = assets.get(item.path);
      if (!asset) throw new Error('分类素材不在采集范围：' + item.path);
      const stat = fs.statSync(localPath(facts.identity.root, item.path));
      if (!stat.isFile() || stat.size !== asset.bytes || stat.mtimeMs !== asset.modifiedAt)
        throw new Error('分类素材已变化，请重新 collect：' + item.path);
      if (
        asset.sha256 &&
        assetHash(localPath(facts.identity.root, item.path), asset.bytes) !== asset.sha256
      )
        throw new Error('分类素材内容已变化，请重新 collect：' + item.path);
      if (!item.suggestedPath) continue;
      if (
        isLocalCanvasImagePath(item.path) ||
        asset.referenceEvidence?.some((ref) => ref.kind === 'canvas' && ref.relation === 'uses')
      )
        throw new Error(
          '画布管理或直接使用的图片需通过画布正式接口处理，请保持原位或先核实：' + item.path
        );
      const target = item.suggestedPath;
      if (
        !target.startsWith('assets/') ||
        target.includes('\\') ||
        target
          .split('/')
          .some(
            (part) =>
              !part ||
              part.startsWith('.') ||
              /[<>:"|?*]/.test(part) ||
              [...part].some((character) => character.charCodeAt(0) < 32) ||
              /[. ]$/.test(part) ||
              /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
          ) ||
        path.posix.basename(target) !== path.posix.basename(item.path)
      )
        throw new Error('建议路径须在 assets 内保留原文件名，且兼容 Windows：' + target);
      const normalized = target.normalize('NFC').toLowerCase();
      if (targets.has(normalized)) throw new Error('建议目标路径重复：' + target);
      targets.add(normalized);
      // Inspect existing ancestors without creating directories or following links.
      let parent = facts.identity.root;
      for (const part of target.split('/')) {
        const exists = fs.existsSync(parent);
        if (exists && !fs.statSync(parent).isDirectory())
          throw new Error('建议目录被文件占用：' + target);
        const collision = exists
          ? fs
              .readdirSync(parent)
              .find(
                (name) =>
                  name.normalize('NFC').toLowerCase() === part.normalize('NFC').toLowerCase()
              )
          : undefined;
        if (collision && collision !== part)
          throw new Error('建议路径存在大小写或 Unicode 冲突：' + target);
        parent = path.join(parent, part);
        try {
          if (fs.lstatSync(parent).isSymbolicLink()) throw new Error('建议路径包含链接：' + target);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      if (fs.existsSync(parent) || fs.existsSync(parent + '.meta'))
        throw new Error('建议目标或 meta 已存在：' + target);
    }
    for (const target of targets) {
      const parts = target.split('/');
      while (parts.pop() && parts.length)
        if (targets.has(parts.join('/')))
          throw new Error('建议目录与另一建议文件目标冲突：' + target);
    }
  }
  const evidence: Evidence[] = [
    ...analysis.guide.map((item) => item.evidence),
    ...(analysis.flow?.nodes.map((item) => item.evidence) ?? []),
    ...analysis.findings.flatMap((item) => item.evidence),
    ...(analysis.organization?.items.flatMap((item) => item.evidence) ?? []),
  ];
  const lineCounts = new Map<string, number>();
  for (const ref of evidence) {
    const source = sources.get(ref.path);
    if (source) {
      if (ref.line > source.lines) throw new Error('源码依据行号越界：' + ref.path);
      continue;
    }
    if (ref.path.endsWith('.lua')) throw new Error('Lua 依据未包含在收集范围：' + ref.path);
    const filename = localPath(facts.identity.root, ref.path);
    const stat = fs.statSync(filename);
    if (!stat.isFile() && !stat.isDirectory()) throw new Error('依据不是文件或目录。');
    let lines = lineCounts.get(ref.path);
    if (lines === undefined) {
      lines =
        stat.isFile() &&
        /\.(json|md|txt|xml|meta|material|prefab|scene)$/.test(ref.path) &&
        stat.size <= 4 * 1024 * 1024
          ? fs.readFileSync(filename, 'utf8').split('\n').length
          : 1;
      lineCounts.set(ref.path, lines);
    }
    if (ref.line > lines)
      throw new Error('依据行号越界；目录、二进制或超限文本只能使用行号 1：' + ref.path);
  }
}

export async function publishProjectCheck(targetDir: string, input: unknown) {
  const project = identity(targetDir);
  const analysis = parseAnalysis(input);
  return withLock(project, () => {
    const dir = directory(project);
    const snapshot = readJson<Facts>(path.join(dir, 'facts.json'));
    const previous = readJson<Published>(path.join(dir, 'result.json'));
    if (
      !snapshot ||
      snapshot.revision !== analysis.factsRevision ||
      (previous?.revision ?? 'none') !== analysis.resultRevision
    )
      throw new Error('检查依据或已发布结果发生变化，请重新 collect 后复核；原结果未改动。');
    sameIdentity(snapshot.value.identity, project);
    validateEvidence(snapshot.value, analysis);
    sameIdentity(identity(project.root), project);
    const published: Published = {
      schema: 1,
      publishedAt: new Date().toISOString(),
      facts: snapshot.value,
      analysis,
    };
    writeJson(path.join(dir, 'result.json'), published);
    return {
      ok: true,
      publishedAt: published.publishedAt,
      project: project.root,
      resultRevision: readJson<Published>(path.join(dir, 'result.json'))!.revision,
    };
  });
}

// Only image requests share cached reports; publication always reads fresh revisions.
const mediaReports = new Map<
  string,
  { stamp: string; saved: NonNullable<ReturnType<typeof readProjectCheck>> }
>();
/** Result viewer: reads one saved report, without scanning project files. */
export function readProjectCheck(
  targetDir: string,
  cacheForMedia = false
): (Published & { resultRevision: string }) | null {
  const project = identity(targetDir);
  const filename = path.join(directory(project), 'result.json');
  let stamp = '';
  if (cacheForMedia) {
    try {
      const stat = fs.lstatSync(filename, { bigint: true });
      if (!stat.isFile() || stat.size > BigInt(MAX_RESULT_BYTES))
        throw new Error('检查结果文件无效或超过 32 MiB。');
      stamp = [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
      const cached = mediaReports.get(filename);
      if (cached?.stamp === stamp) return cached.saved;
    } catch (error) {
      mediaReports.delete(filename);
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    mediaReports.delete(filename);
  }
  const saved = readJson<Published>(filename);
  if (!saved) return null;
  if (saved.value.schema !== 1) throw new Error('不支持的项目检查结果版本。');
  sameIdentity(saved.value.facts.identity, project);
  const result = {
    ...saved.value,
    analysis: parseAnalysis(saved.value.analysis),
    resultRevision: saved.revision,
  };
  if (cacheForMedia) {
    if (mediaReports.size >= 4) mediaReports.delete(mediaReports.keys().next().value!);
    mediaReports.set(filename, { stamp, saved: result });
  }
  return result;
}

export function architectureView(saved: NonNullable<ReturnType<typeof readProjectCheck>>) {
  const { facts, analysis } = saved;
  const groups = analysis.modules.map((module) => ({ ...module, symbols: [] }));
  if (!groups.length)
    groups.push({
      id: 'empty',
      title: '无可分析源码',
      description: analysis.insight,
      files: [],
      symbols: [],
    });
  const membership = new Map(
    groups.flatMap((group) => group.files.map((file) => [file, group.id] as const))
  );
  const groupEdges: Array<{
    from: string;
    to: string;
    kind: string;
    count: number;
    evidence: Facts['architecture']['edges'];
  }> = [];
  for (const edge of facts.architecture.edges) {
    const from = membership.get(edge.from)!,
      to = membership.get(edge.to)!;
    if (from === to) continue;
    let group = groupEdges.find((item) => item.from === from && item.to === to);
    if (!group) {
      group = { from, to, kind: '字面量加载', count: 0, evidence: [] };
      groupEdges.push(group);
    }
    group.count++;
    group.evidence.push(edge);
  }
  const project = {
    ...facts.architecture,
    id: hash(facts.identity.root),
    path: facts.identity.root,
    name: path.basename(facts.identity.root),
    displayName: path.basename(facts.identity.root),
    kind: analysis.auto ? '自动检查 · 按目录分组' : 'AI 源码分析',
    source: 'CLI 保存的检查结果',
    single: false,
    summary: analysis.summary,
    insight: analysis.insight,
    groups,
    groupEdges,
    manualEdges: [],
    engineRefs: [],
    notes: [...facts.architecture.notes, ...analysis.limitations],
    dynamicCount: facts.architecture.files.reduce(
      (sum, file) => sum + file.dynamicRequires.length,
      0
    ),
    guide: analysis.guide,
    flow: analysis.flow,
  };
  return {
    scannedAt: facts.collectedAt,
    publishedAt: saved.publishedAt,
    scope: '当前项目的已保存快照',
    projects: [project],
    unavailable: [],
    stats: { projects: 1, files: project.files.length, unavailable: 0 },
  };
}
