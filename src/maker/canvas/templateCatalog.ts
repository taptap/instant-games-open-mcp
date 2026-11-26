import fs from 'node:fs/promises';
import path from 'node:path';
import { canvasSupportsPlatform } from '../../../packages/maker-canvas/src/contracts/platform.js';
import { setImmediate } from 'node:timers/promises';
import { builtinCanvasTemplates } from './presets.js';
import { builtinPresetDescriptions } from './presetDescriptions.js';
import { templatePresentation } from './templatePresentation.js';
import {
  isBuiltinCanvasTemplate,
  templateCoverSource,
  type CanvasTemplatePage,
  type CanvasTemplateSummary,
  type CanvasWorkflowTemplate,
} from './templates.js';

const catalogs = new Map<string, Map<string, { stamp: string; summary?: CanvasTemplateSummary }>>();

function summarize(template: CanvasWorkflowTemplate, updatedAt: number): CanvasTemplateSummary {
  return {
    id: template.id,
    name: template.name,
    ...(template.builtin
      ? {
          ...(builtinPresetDescriptions[template.id]
            ? { description: builtinPresetDescriptions[template.id] }
            : {}),
          category: template.category ?? templatePresentation(template.id).category,
          ...(template.isNew ? { isNew: true } : {}),
        }
      : {
          ...(template.description ? { description: template.description } : {}),
          ...(template.category ? { category: template.category } : {}),
        }),
    revision: template.revision,
    builtin: template.builtin,
    ...(template.platforms ? { platforms: template.platforms } : {}),
    ...(template.cliOnly ? { cliOnly: true } : {}),
    ...(template.skills?.length ? { skills: template.skills } : {}),
    nodeCount: template.nodes.length,
    hasCover: Boolean(templateCoverSource(template)),
    ...(template.previewChapters?.length ? { hasChapterPreview: true } : {}),
    updatedAt,
  };
}

function presetPriority(template: CanvasTemplateSummary): number {
  if (template.id === '7e1cb6ad-732f-4dc3-a951-000000000015') return 2;
  return template.isNew ? 1 : 0;
}

export async function readTemplatePage(
  folder: string,
  read: (id: string) => CanvasWorkflowTemplate,
  page: number,
  query: string,
  category = ''
): Promise<CanvasTemplatePage> {
  let cache = catalogs.get(folder);
  if (!cache) cache = new Map();
  catalogs.delete(folder);
  catalogs.set(folder, cache);
  if (catalogs.size > 8) catalogs.delete(catalogs.keys().next().value!);
  const names = (await fs.readdir(folder)).filter(
    (name) => /^[0-9a-f-]{36}\.json$/i.test(name) && !isBuiltinCanvasTemplate(name.slice(0, -5))
  );
  const ids = new Set(names.map((name) => name.slice(0, -5)));
  for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
  const summaries: CanvasTemplateSummary[] = [];
  let skipped = 0;
  for (const name of names) {
    const id = name.slice(0, -5);
    try {
      const stat = await fs.lstat(path.join(folder, name));
      if (!stat.isFile() || stat.isSymbolicLink()) {
        skipped++;
        continue;
      }
      const stamp = [stat.mtimeMs, stat.ctimeMs, stat.size, stat.ino].join(':');
      let entry = cache.get(id);
      if (entry?.stamp !== stamp) {
        entry = { stamp };
        try {
          entry.summary = summarize(read(id), stat.mtimeMs);
        } catch {
          entry.summary = undefined;
        }
        cache.set(id, entry);
        await setImmediate();
      }
      if (entry.summary) summaries.push(entry.summary);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  const matches = (summary: CanvasTemplateSummary) =>
    [
      summary.name,
      summary.description || (summary.builtin ? '' : '自定义工作流'),
      summary.category || '',
    ]
      .join(' ')
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase());
  // Presets are filtered by the page; user templates are paged here, so their filter is too.
  const filtered = summaries
    .filter((item) => canvasSupportsPlatform(item, 'local'))
    .filter((item) => !category || item.category === category)
    .filter(matches)
    .sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id));
  const pageSize = 24;
  const current = Math.min(
    Math.max(1, Math.floor(page) || 1),
    Math.max(1, Math.ceil(filtered.length / pageSize))
  );
  return {
    presets: builtinCanvasTemplates()
      .filter((item) => canvasSupportsPlatform(item, 'local'))
      .map((template) => summarize(template, 0))
      .filter(matches)
      .sort((left, right) => presetPriority(right) - presetPriority(left)),
    items: filtered.slice((current - 1) * pageSize, current * pageSize),
    page: current,
    pageSize,
    total: filtered.length,
    skipped,
  };
}
