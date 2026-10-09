import type { CanvasDocument, CanvasNode, CanvasEdge } from './model.js';
import { builtinPresetDescriptions } from './presetDescriptions.js';
import { templatePresentation } from './templatePresentation.js';

export interface CanvasWorkflowTemplate {
  id: string;
  name: string;
  revision: number;
  builtin?: boolean;
  skills?: string[];
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface CanvasTemplateStore {
  exportTemplate?(id: string, revision: number): Promise<Blob>;
  importTemplate?(zip: Blob): Promise<CanvasWorkflowTemplate>;
  skillUrl?(name: string): string;
  getPreviewImage?(
    id: string,
    revision: number,
    nodeId: string,
    signal?: AbortSignal
  ): Promise<Blob>;
  modelPreviewUrl?(id: string, revision: number): string;
  listTemplatePage(page: number, query: string): Promise<CanvasTemplatePage>;
  getTemplate(id: string): Promise<CanvasWorkflowTemplate>;
  getCover(
    id: string,
    revision: number,
    signal?: AbortSignal,
    slot?: number
  ): Promise<{ blob: Blob; source: boolean; animation?: CanvasTemplateCoverAnimation }>;
  saveCover(
    id: string,
    revision: number,
    blob: Blob,
    signal?: AbortSignal,
    slot?: number
  ): Promise<void>;
  saveTemplate(template: CanvasWorkflowTemplate): Promise<CanvasWorkflowTemplate>;
  deleteTemplate(id: string, revision: number): Promise<void>;
  prepareTemplate?(id: string, canvasId: string): Promise<CanvasWorkflowTemplate>;
}

export interface CanvasTemplateCoverAnimation {
  fps: number;
  frames: Array<{ x: number; y: number; width: number; height: number }>;
}

export interface CanvasTemplateSummary {
  id: string;
  name: string;
  revision: number;
  builtin?: boolean;
  skills?: string[];
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

export function templateCoverNode(
  template: CanvasWorkflowTemplate,
  slot = 0
): CanvasNode | undefined {
  if (slot !== 0 && slot !== 1) return;
  const previews = template.builtin ? templatePresentation(template.id).previews : undefined;
  if (previews) {
    const preview = previews[slot];
    return preview
      ? template.nodes.filter((node) => node.type === 'image')[preview.index]
      : undefined;
  }
  if (slot !== 0) return;
  const results = template.nodes
    .filter((node) => node.assetPath && node.frameSetInfo?.frames.length)
    .sort((left, right) => left.x - right.x || left.y - right.y || left.id.localeCompare(right.id));
  const animation =
    results.find((node) => node.type === 'animation') ||
    results.find((node) => node.type === 'sequence');
  if (animation) return animation;
  const images = template.nodes
    .filter((node) => node.type === 'image' && node.assetPath)
    .sort((left, right) => left.x - right.x || left.y - right.y || left.id.localeCompare(right.id));
  return images.find((node) => !template.edges.some((edge) => edge.to === node.id)) || images[0];
}

export function templateCoverSource(
  template: CanvasWorkflowTemplate,
  slot = 0
): string | undefined {
  return templateCoverNode(template, slot)?.assetPath;
}

export function templateCoverAnimation(
  template: CanvasWorkflowTemplate,
  compact = false,
  slot = 0
): CanvasTemplateCoverAnimation | undefined {
  const info = templateCoverNode(template, slot)?.frameSetInfo;
  if (!info?.frames.length) return;
  const count = Math.min(32, info.frames.length);
  return {
    fps: (info.fps * count) / info.frames.length,
    frames: Array.from({ length: count }, (_, index) => {
      if (compact)
        return { x: (index % 8) * 128, y: Math.floor(index / 8) * 128, width: 128, height: 128 };
      const frame =
        info.frames[count === 1 ? 0 : Math.round((index * (info.frames.length - 1)) / (count - 1))];
      return { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
    }),
  };
}

export function isBuiltinCanvasTemplate(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(builtinPresetDescriptions, id);
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
      delete node.templateSkills;
      delete node.templatePending;
      if (node.uiRecognition)
        node.uiRecognition = {
          enabled: node.uiRecognition.enabled,
          model: node.uiRecognition.model,
          results: [],
        };
      if (node.uiRecognitionSourceId && !selected.has(node.uiRecognitionSourceId))
        delete node.uiRecognitionSourceId;
      if (node.sourceVideoId && !selected.has(node.sourceVideoId))
        throw new Error('抽帧卡依赖选区外的视频，请一起选中后保存。');
      if (node.sourceSnapshot && !selected.has(node.sourceSnapshot.nodeId))
        delete node.sourceSnapshot;
      if (node.sourceSnapshots)
        node.sourceSnapshots = node.sourceSnapshots.filter((snapshot) =>
          selected.has(snapshot.nodeId)
        );
      if (
        node.generationDraft?.sourceImageId &&
        !selected.has(node.generationDraft.sourceImageId)
      ) {
        throw new Error('图片草稿依赖选区外的参考卡，请一起选中后保存。');
      }
      if (node.generationDraft?.sourceImageIds) {
        if (node.generationDraft.sourceImageIds.some((id) => !selected.has(id)))
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
      for (const snapshot of [
        ...(node.sourceSnapshots || []),
        ...(node.sourceSnapshot ? [node.sourceSnapshot] : []),
      ]) {
        const source = document.nodes.find((item) => item.id === snapshot.nodeId);
        const copy = nodes.find((item) => item.id === snapshot.nodeId);
        if (source && copy && source.generation?.attemptId) {
          const oldVersion = [
            source.type,
            source.assetPath || 'missing-asset',
            source.generation.attemptId,
          ].join('|');
          if (snapshot.version === oldVersion)
            snapshot.version = [copy.type, copy.assetPath || 'missing-asset', 'manual-asset'].join(
              '|'
            );
        }
      }
    }
    const sectionIds = new Set(members(document, ids).map((node) => node.sectionId));
    const skills = [
      ...new Set(
        document.nodes
          .filter((node) => node.type === 'section' && sectionIds.has(node.id))
          .flatMap((node) => node.templateSkills || [])
      ),
    ];
    return {
      id: createId(),
      name: name.trim(),
      ...(skills.length ? { skills } : {}),
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
    const modelWorkflow = nodes.some((node) => node.type === 'model-views');
    const savedExampleWorkflow =
      template.builtin &&
      // UI production examples remain visible, but do not complete a new workflow.
      template.id !== '7e1cb6ad-732f-4dc3-a951-000000000012' &&
      (nodes.some((node) => node.type === 'image-assets' && node.imageAssetsInfo?.items.length) ||
        nodes.every((node) => node.type === 'image' && node.assetPath));
    const ids = new Map(nodes.map((node) => [node.id, createId()]));
    for (const node of nodes) {
      node.id = ids.get(node.id)!;
      if (node.uiRecognitionSourceId)
        node.uiRecognitionSourceId = ids.get(node.uiRecognitionSourceId);
      if (node.uiRecognition)
        node.uiRecognition = {
          enabled: node.uiRecognition.enabled,
          model: node.uiRecognition.model,
          results: [],
        };
      node.x += position.x;
      node.y += position.y;
      if (node.sourceVideoId) node.sourceVideoId = ids.get(node.sourceVideoId);
      if (node.sourceSnapshot) node.sourceSnapshot.nodeId = ids.get(node.sourceSnapshot.nodeId)!;
      for (const snapshot of node.sourceSnapshots || [])
        snapshot.nodeId = ids.get(snapshot.nodeId)!;
      if (node.generationDraft?.sourceImageId)
        node.generationDraft.sourceImageId = ids.get(node.generationDraft.sourceImageId);
      if (node.generationDraft?.sourceImageIds)
        node.generationDraft.sourceImageIds = node.generationDraft.sourceImageIds.map(
          (id) => ids.get(id)!
        );
      if (node.generation?.sourceImageId)
        node.generation.sourceImageId = ids.get(node.generation.sourceImageId);
      if (node.generation?.sourceImageIds)
        node.generation.sourceImageIds = node.generation.sourceImageIds.map((id) => ids.get(id)!);
      if (
        !['model', 'model-views'].includes(node.type) &&
        !savedExampleWorkflow &&
        template.edges.some((edge) => ids.get(edge.to) === node.id)
      )
        node.templatePending = true;
      if (modelWorkflow && node.type === 'image' && !node.assetPath) node.templatePending = true;
    }
    const section = group(nodes, template.name);
    section.templateId = template.id;
    section.templateRevision = template.revision;
    if (template.skills?.length) section.templateSkills = [...template.skills];
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
