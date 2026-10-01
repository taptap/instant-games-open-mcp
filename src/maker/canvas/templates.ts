import type { CanvasDocument, CanvasNode, CanvasEdge } from './model.js';

export interface CanvasWorkflowTemplate {
  id: string;
  name: string;
  revision: number;
  builtin?: boolean;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface CanvasTemplateStore {
  listTemplatePage(page: number, query: string): Promise<CanvasTemplatePage>;
  getTemplate(id: string): Promise<CanvasWorkflowTemplate>;
  getCover(
    id: string,
    revision: number,
    signal?: AbortSignal
  ): Promise<{ blob: Blob; source: boolean }>;
  saveCover(id: string, revision: number, blob: Blob, signal?: AbortSignal): Promise<void>;
  saveTemplate(template: CanvasWorkflowTemplate): Promise<CanvasWorkflowTemplate>;
  deleteTemplate(id: string, revision: number): Promise<void>;
  prepareTemplate?(id: string, canvasId: string): Promise<CanvasWorkflowTemplate>;
}

export interface CanvasTemplateSummary {
  id: string;
  name: string;
  revision: number;
  builtin?: boolean;
  nodeCount: number;
  hasCover: boolean;
  updatedAt: number;
}

export interface CanvasTemplatePage {
  presets: CanvasTemplateSummary[];
  items: CanvasTemplateSummary[];
  page: number;
  pageSize: number;
  total: number;
  skipped: number;
}

export function templateCoverSource(template: CanvasWorkflowTemplate): string | undefined {
  const images = template.nodes
    .filter((node) => node.type === 'image' && node.assetPath)
    .sort((left, right) => left.x - right.x || left.y - right.y || left.id.localeCompare(right.id));
  return (images.find((node) => !template.edges.some((edge) => edge.to === node.id)) || images[0])
    ?.assetPath;
}

export function isBuiltinCanvasTemplate(id: string): boolean {
  return (
    id === '7e1cb6ad-732f-4dc3-a951-000000000001' || id === '7e1cb6ad-732f-4dc3-a951-000000000002'
  );
}

export function createCanvasTemplateModel(createId: () => string = () => crypto.randomUUID()) {
  function members(document: CanvasDocument, ids: string[]): CanvasNode[] {
    const selected = new Set(ids);
    return document.nodes.filter(
      (node) =>
        node.type !== 'section' &&
        (selected.has(node.id) || Boolean(node.sectionId && selected.has(node.sectionId)))
    );
  }
  function snapshot(document: CanvasDocument, ids: string[], name: string): CanvasWorkflowTemplate {
    const nodes: CanvasNode[] = JSON.parse(JSON.stringify(members(document, ids)));
    if (nodes.length < 2) throw new Error('请至少选择两张卡片。');
    const selected = new Set(nodes.map((node) => node.id));
    const edges = document.edges.filter((edge) => selected.has(edge.from) && selected.has(edge.to));
    if (!edges.length) throw new Error('请选择至少有一条内部连线的卡片。');
    const left = Math.min(...nodes.map((node) => node.x));
    const top = Math.min(...nodes.map((node) => node.y));
    for (const node of nodes) {
      node.x -= left;
      node.y -= top;
      delete node.sectionId;
      delete node.templateId;
      delete node.templateRevision;
      delete node.templatePending;
      if (node.sourceVideoId && !selected.has(node.sourceVideoId))
        throw new Error('抽帧卡依赖选区外的视频，请一起选中后保存。');
      if (node.sourceSnapshot && !selected.has(node.sourceSnapshot.nodeId))
        delete node.sourceSnapshot;
      if (
        node.generationDraft?.sourceImageId &&
        !selected.has(node.generationDraft.sourceImageId)
      ) {
        throw new Error('图片草稿依赖选区外的参考卡，请一起选中后保存。');
      }
      if (node.generation) {
        delete node.generation.taskId;
        delete node.generation.attemptId;
        if (node.generation.sourceImageId && !selected.has(node.generation.sourceImageId))
          delete node.generation.sourceImageId;
        if (node.generation.sourceImageIds)
          node.generation.sourceImageIds = node.generation.sourceImageIds.filter((id) =>
            selected.has(id)
          );
      }
    }
    for (const node of nodes) {
      if (node.sourceSnapshot) {
        const source = document.nodes.find((item) => item.id === node.sourceSnapshot!.nodeId);
        const copy = nodes.find((item) => item.id === node.sourceSnapshot!.nodeId);
        if (source && copy && source.generation?.attemptId) {
          const oldVersion = [
            source.type,
            source.assetPath || 'missing-asset',
            source.generation.attemptId,
          ].join('|');
          if (node.sourceSnapshot.version === oldVersion)
            node.sourceSnapshot.version = [
              copy.type,
              copy.assetPath || 'missing-asset',
              'manual-asset',
            ].join('|');
        }
      }
    }
    return {
      id: createId(),
      name: name.trim(),
      revision: 0,
      nodes,
      edges: JSON.parse(JSON.stringify(edges)),
    };
  }
  function group(nodes: CanvasNode[], name: string): CanvasNode {
    const left = Math.min(...nodes.map((node) => node.x)) - 28;
    const top = Math.min(...nodes.map((node) => node.y)) - 56;
    return {
      id: createId(),
      type: 'section',
      title: name,
      x: left,
      y: top,
      width: Math.max(240, Math.max(...nodes.map((node) => node.x + node.width)) + 28 - left),
      height: Math.max(160, Math.max(...nodes.map((node) => node.y + node.height)) + 28 - top),
    };
  }
  function instantiate(template: CanvasWorkflowTemplate, position: { x: number; y: number }) {
    const nodes: CanvasNode[] = JSON.parse(JSON.stringify(template.nodes));
    const ids = new Map(nodes.map((node) => [node.id, createId()]));
    for (const node of nodes) {
      node.id = ids.get(node.id)!;
      node.x += position.x;
      node.y += position.y;
      if (node.sourceVideoId) node.sourceVideoId = ids.get(node.sourceVideoId);
      if (node.sourceSnapshot) node.sourceSnapshot.nodeId = ids.get(node.sourceSnapshot.nodeId)!;
      if (node.generationDraft?.sourceImageId)
        node.generationDraft.sourceImageId = ids.get(node.generationDraft.sourceImageId);
      if (node.generation?.sourceImageId)
        node.generation.sourceImageId = ids.get(node.generation.sourceImageId);
      if (node.generation?.sourceImageIds)
        node.generation.sourceImageIds = node.generation.sourceImageIds.map((id) => ids.get(id)!);
      if (template.edges.some((edge) => ids.get(edge.to) === node.id)) node.templatePending = true;
    }
    const section = group(nodes, template.name);
    section.templateId = template.id;
    section.templateRevision = template.revision;
    nodes.forEach((node) => {
      node.sectionId = section.id;
    });
    const edges = template.edges.map((edge) => ({
      ...edge,
      id: createId(),
      from: ids.get(edge.from)!,
      to: ids.get(edge.to)!,
    }));
    return { nodes: [section, ...nodes], edges, section };
  }
  function updateMembership(document: CanvasDocument, movedIds: string[]): void {
    const moved = new Set(movedIds);
    const sections = document.nodes.filter((node) => node.type === 'section');
    for (const node of document.nodes) {
      if (
        node.type === 'section' ||
        !moved.has(node.id) ||
        (node.sectionId && moved.has(node.sectionId))
      )
        continue;
      const section = sections.find(
        (group) =>
          !moved.has(group.id) &&
          node.x >= group.x &&
          node.y >= group.y + 28 &&
          node.x + node.width <= group.x + group.width &&
          node.y + node.height <= group.y + group.height
      );
      if (section) node.sectionId = section.id;
      else {
        delete node.sectionId;
        delete node.templatePending;
      }
    }
  }
  return { members, snapshot, group, instantiate, updateMembership };
}
