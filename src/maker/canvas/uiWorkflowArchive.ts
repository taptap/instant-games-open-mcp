import { createHash } from 'node:crypto';
import type { CanvasDocument } from './model.js';
import { validateUiBbox } from './uiBbox.js';
import {
  resourceBundleEntries,
  resourceBundleMembers,
  validateResourceBundle,
} from './resourceBundle.js';
import { selectedUiRecognition, uiRecognitionSource } from './uiRecognition.js';

export interface UiWorkflowArchive {
  version: 1;
  uiId: string;
  title: string;
  canvasId: string;
  nodeId: string;
  revision: string;
  stage: 'recognized' | 'resources';
  directory: string;
  bboxPath: string;
  bindingsPath?: string;
  confirmed?: boolean;
  savedAt?: string;
}

export function uiArchiveFingerprint(document: CanvasDocument): string {
  return JSON.stringify([
    document.title,
    document.edges,
    document.nodes.map((node) => [
      node.id,
      node.type,
      node.title,
      node.sectionId,
      node.assetPath,
      node.templatePending,
      node.uiRecognition,
      node.generation?.uiAtlasPlan,
      node.imageAssetsInfo,
      node.sourceSnapshot,
      node.sourceSnapshots,
    ]),
  ]);
}

export async function prepareUiWorkflowArchives(
  document: CanvasDocument,
  readBlob: (path: string) => Promise<Blob>
): Promise<Array<{ record: UiWorkflowArchive; files: Array<{ name: string; bytes: Buffer }> }>> {
  const archives: Array<{
    record: UiWorkflowArchive;
    files: Array<{ name: string; bytes: Buffer }>;
  }> = [];
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const directory = (uiId: string, revision: string) =>
    '.maker/canvases/ui-archives/' + uiId + '/' + revision;
  for (const node of document.nodes) {
    if (node.templatePending) continue;
    for (const result of node.uiRecognition?.results || []) {
      if (!result.bbox) continue;
      const bbox = validateUiBbox(result.bbox);
      const revision = 'bbox-' + hash(bbox);
      const uiId = document.id + '_' + node.id;
      const folder = directory(uiId, revision);
      archives.push({
        record: {
          version: 1,
          uiId,
          title: document.title,
          canvasId: document.id,
          nodeId: node.id,
          revision,
          stage: 'recognized',
          directory: folder,
          bboxPath: folder + '/bbox.json',
        },
        files: [{ name: 'bbox.json', bytes: Buffer.from(JSON.stringify(bbox, null, 2)) }],
      });
    }
  }
  const targets = document.nodes.filter(
    (node) =>
      node.type === 'resource-bundle' ||
      (node.type === 'section' &&
        !document.nodes.some(
          (child) => child.sectionId === node.id && child.type === 'resource-bundle'
        ))
  );
  for (const target of targets) {
    const members = resourceBundleMembers(document, target.id);
    if (!members.some((node) => node.imageAssetsInfo?.items.length)) continue;
    try {
      validateResourceBundle(document, target.id);
    } catch {
      continue;
    }
    const sourcesHavePlan = members.some((member) =>
      document.edges.some(
        (edge) =>
          edge.to === member.id &&
          document.nodes.some((node) => node.id === edge.from && node.generation?.uiAtlasPlan)
      )
    );
    if (!sourcesHavePlan) continue;
    if (
      members.some((member) =>
        document.edges
          .filter((edge) => edge.to === member.id)
          .some((edge) => {
            const source = document.nodes.find((node) => node.id === edge.from);
            const plan = source?.generation?.uiAtlasPlan;
            if (!source || !plan) return false;
            const recognition = uiRecognitionSource(document, source);
            const live = recognition && selectedUiRecognition(recognition)?.bbox;
            return !live || JSON.stringify(validateUiBbox(live)) !== JSON.stringify(plan.bbox);
          })
      )
    )
      continue;
    const entries = await resourceBundleEntries(
      document,
      target.id,
      (value) => value,
      undefined,
      readBlob
    );
    const bindingEntry = entries.find((entry) => entry.name === 'bindings.json');
    if (!bindingEntry) continue;
    const bindings = JSON.parse(await bindingEntry.blob.text());
    const revision = 'assets-' + hash(bindings);
    const folder = directory(bindings.ui.id, revision);
    const files = await Promise.all(
      entries.map(async (entry) => ({
        name: entry.name,
        bytes: Buffer.from(await entry.blob.arrayBuffer()),
      }))
    );
    if (files.reduce((total, entry) => total + entry.bytes.length, 0) > 128 * 1024 * 1024)
      throw new Error('UI 归档超过 128 MiB，请拆分资源包。');
    archives.push({
      record: {
        version: 1,
        uiId: bindings.ui.id,
        title: document.title,
        canvasId: document.id,
        nodeId: target.id,
        revision,
        stage: 'resources',
        directory: folder,
        bboxPath: folder + '/bbox.json',
        bindingsPath: folder + '/bindings.json',
        confirmed: bindings.confirmed,
      },
      files,
    });
  }
  return archives;
}
