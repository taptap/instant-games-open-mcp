import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { marked } from 'marked';
import { ConsoleError } from './types.js';
import {
  formatMakerAdsIntegrationGuide,
  MAKER_ADS_INTEGRATION_GUIDE_URI,
} from '../server/adIntegrationGuide.js';

export type ConsoleDocument = {
  id: string;
  title: string;
  kind: 'docs' | 'project' | 'skills';
  category: string;
  source: string;
  relativePath: string;
  featured?: boolean;
  purpose?: string;
  scope?: string;
  related?: string[];
};
type Entry = ConsoleDocument & { filename: string; root: string; content?: string };
type Guide = {
  title: string;
  purpose: string;
  scope: string;
  featured?: boolean;
  related?: string[];
};
const GUIDES: Record<string, Guide> = {
  [MAKER_ADS_INTEGRATION_GUIDE_URI]: {
    title: '广告接入与激励奖励',
    featured: true,
    purpose: '先让 AI 检查并同步广告配置，再接入看广告复活、双倍奖励等玩法。',
    scope: 'Maker 广告流程；播放与奖励需在支持广告的环境验证',
    related: ['engine-docs/recipes/sdk.md', 'skill:setup-ads'],
  },
  'engine-docs/recipes/client-cloud-score.md': {
    title: '云存档与排行榜',
    featured: true,
    purpose: '保存玩家进度、金币与最高分，并展示排行榜。',
    scope: '客户端 clientCloud；不是本地文件存档',
    related: ['engine-docs/recipes/file-storage.md', 'engine-docs/recipes/server-cloud-score.md'],
  },
  'engine-docs/recipes/network-game-guide.md': {
    title: '多人联机',
    featured: true,
    purpose: '了解客户端与服务端分工、场景同步和玩家交互。',
    scope: '联网游戏；本地窗口预览不能替代联机验证',
    related: ['engine-docs/api/network.md', 'engine-docs/recipes/server-cloud-score.md'],
  },
  'engine-docs/recipes/server-cloud-score.md': {
    title: '服务端数据与云存储',
    purpose: '在联网游戏服务端管理玩家数据及云端操作。',
    scope: '仅限 UrhoXServer 服务端脚本',
    related: ['engine-docs/recipes/client-cloud-score.md'],
  },
  'engine-docs/recipes/ui.md': {
    title: 'UI 开发与布局',
    purpose: '构建游戏界面、布局和交互，查阅 UI 组件用法。',
    scope: '项目内 UrhoX UI；适配流程见相关 Skill',
    related: ['skill:maker-resolution-adaptation', 'skill:nvg-resolution-mode'],
  },
  'engine-docs/recipes/preload-and-build-refs.md': {
    title: '资源加载与缺失排查',
    purpose: '检查资源构建引用、预下载和资源未打包问题。',
    scope: '资源构建与加载',
    related: ['engine-docs/recipes/download-while-playing.md'],
  },
  'docs/MAKER_LOCAL_PREVIEW.md': {
    title: '本地预览',
    purpose: '安装 Runtime、启动预览并调整预览窗口。',
    scope: '本机 Runtime',
    related: ['docs/MAKER_CONSOLE.md', 'docs/MAKER_MCP_CONNECTION_TROUBLESHOOTING.md'],
  },
  'docs/MAKER_MCP_CONNECTION_TROUBLESHOOTING.md': {
    title: 'MCP 连接排障',
    purpose: '排查 AI 客户端连接 Maker MCP 的问题。',
    scope: 'MCP 安装与连接',
  },
  'skill:setup-ads': {
    title: '广告接入 Skill',
    featured: true,
    purpose: '指导 AI 同步广告配置并实现激励广告及奖励逻辑。',
    scope: '供 AI 执行的指导；此页面只阅读，不自动运行',
    related: [MAKER_ADS_INTEGRATION_GUIDE_URI, 'engine-docs/recipes/sdk.md'],
  },
  'skill:maker-resolution-adaptation': {
    title: '多分辨率适配 Skill',
    purpose: '指导 AI 检查不同屏幕比例下的界面适配。',
    scope: '以当前项目 Skill 说明为准',
    related: ['engine-docs/recipes/ui.md'],
  },
};
function guideKey(entry: ConsoleDocument): string {
  if (entry.kind === 'skills' && entry.relativePath.endsWith('/SKILL.md'))
    return 'skill:' + entry.relativePath.split('/').slice(-2, -1)[0];
  return entry.relativePath;
}
function enrich(entries: Entry[]): Entry[] {
  for (const entry of entries) {
    // Never identify project-authored docs as bundled official guides by filename alone.
    if (entry.kind === 'project') continue;
    const guide = GUIDES[guideKey(entry)];
    if (!guide) continue;
    const { related, ...metadata } = guide;
    Object.assign(entry, metadata);
    entry.category = entry.kind === 'skills' ? '常用 Skill' : '常用功能';
    entry.related = (related || []).flatMap((key) =>
      entries
        .filter((candidate) => guideKey(candidate) === key && candidate.kind !== 'project')
        .map((candidate) => candidate.id)
    );
  }
  const order = Object.keys(GUIDES);
  return entries.sort((a, b) => {
    const rank = (entry: Entry) => {
      const index = entry.kind === 'project' ? -1 : order.indexOf(guideKey(entry));
      return index < 0 ? 1000 : index;
    };
    return rank(a) - rank(b);
  });
}
const MAX_FILE = 1024 * 1024;
const MAX_ENTRIES = 600;
const SKILL_DIRS = [
  '.installer/skills',
  'skills',
  '.agents/skills',
  '.claude/skills',
  '.codex/skills',
  '.cursor/skills',
  '.workbuddy/skills',
];
const GROUPS: [string, string][] = [
  ['docs', '项目文档'],
  ['engine-docs', '引擎与 API'],
  ['urhox-libs', '引擎与 API'],
  ['examples', '示例与模板'],
  ['templates', '示例与模板'],
];
function inside(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export class ConsoleDocuments {
  constructor(private readonly packageRoot: string) {}
  private entries(project?: string): Entry[] {
    const entries: Entry[] = [];
    const seen = new Set<string>();
    let visited = 0;
    const collect = (
      base: string,
      source: string,
      relative: string,
      kind: ConsoleDocument['kind'],
      category: string
    ) => {
      if (!fs.existsSync(base)) return;
      const root = fs.realpathSync(base);
      const walk = (filename: string, depth: number) => {
        if (depth > 7 || visited++ > 6000 || entries.length >= MAX_ENTRIES) return;
        try {
          const real = fs.realpathSync(filename);
          if (!inside(root, real)) return;
          const stat = fs.statSync(real);
          if (stat.isDirectory()) {
            if (fs.lstatSync(filename).isSymbolicLink()) return;
            for (const name of fs.readdirSync(filename).sort()) {
              if (name === 'node_modules' || name === '.git') continue;
              walk(path.join(filename, name), depth + 1);
            }
          } else if (
            stat.isFile() &&
            /\.md$/i.test(filename) &&
            stat.size <= MAX_FILE &&
            !seen.has(real)
          ) {
            seen.add(real);
            const relativePath = path.relative(root, filename).split(path.sep).join('/');
            const descriptor = fs.openSync(real, 'r');
            const buffer = Buffer.alloc(Math.min(8192, stat.size));
            let content: string;
            try {
              content = buffer
                .subarray(0, fs.readSync(descriptor, buffer, 0, buffer.length, 0))
                .toString('utf8');
            } finally {
              fs.closeSync(descriptor);
            }
            const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
            const fallback =
              path.basename(filename).toLowerCase() === 'skill.md'
                ? path.basename(path.dirname(filename))
                : path.basename(filename, path.extname(filename));
            entries.push({
              id: createHash('sha256')
                .update(source + ':' + relativePath)
                .digest('hex'),
              title: (heading || fallback).slice(0, 160),
              kind,
              category,
              source,
              relativePath,
              filename: real,
              root,
            });
          }
        } catch {
          /* Files can disappear while a project is being updated. */
        }
      };
      walk(path.join(root, relative), 0);
    };
    for (const filename of [
      'MAKER_CONSOLE.md',
      'MAKER_LOCAL_PREVIEW.md',
      'MAKER_MCP_CONNECTION_TROUBLESHOOTING.md',
    ])
      collect(
        this.packageRoot,
        'Maker 内置',
        `docs/${filename}`,
        'docs',
        filename.includes('TROUBLESHOOTING') ? '安装与排障' : '开发与预览'
      );
    collect(this.packageRoot, 'Maker 内置', 'skills', 'skills', 'Maker 官方 Skill');
    if (project) {
      for (const name of ['README.md', 'AGENTS.md', 'CLAUDE.md'])
        collect(project, '当前项目', name, 'project', '项目入门');
      for (const [directory, category] of GROUPS)
        collect(
          project,
          '当前项目',
          directory,
          directory === 'docs' ? 'project' : 'docs',
          category
        );
      for (const directory of SKILL_DIRS)
        collect(project, '当前项目', directory, 'skills', '项目 Skill');
    }
    entries.unshift({
      id: 'maker-ads-integration-guide',
      title: '广告接入与激励奖励',
      kind: 'docs',
      category: '常用功能',
      source: 'Maker MCP',
      relativePath: MAKER_ADS_INTEGRATION_GUIDE_URI,
      filename: '',
      root: '',
      content: formatMakerAdsIntegrationGuide(),
    });
    return enrich(entries);
  }
  list(project?: string): ConsoleDocument[] {
    return this.entries(project).map(
      ({ filename: _filename, root: _root, content: _content, ...entry }) => entry
    );
  }
  read(id: string, project?: string): Record<string, unknown> {
    const entry = this.entries(project).find((item) => item.id === id);
    if (!entry) throw new ConsoleError('文档不存在或已移除，请刷新目录。', 404);
    let content = entry.content;
    if (content === undefined) {
      const real = fs.realpathSync(entry.filename);
      if (!inside(entry.root, real) || fs.statSync(real).size > MAX_FILE)
        throw new ConsoleError('文档无法安全读取。', 403);
      content = fs.readFileSync(real, 'utf8');
    }
    // Tokens are rendered as DOM nodes; raw HTML and remote images are never executed.
    return {
      id,
      content,
      link: entry.content === undefined ? entry.filename : entry.relativePath,
      tokens: marked.lexer(content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')),
    };
  }
}
