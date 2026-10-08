import type { CanvasDocument, CanvasNode } from './model.js';
import type { CanvasGroupQueueState } from './groupQueue.js';

export function canvasGenerationParameterChoices(image: boolean): Record<string, unknown[]> {
  return image
    ? {
        model: ['auto', 'gpt', 'nanobanana'],
        resolution: ['1K', '2K'],
        aspectRatio: ['1:1', '16:9', '9:16', '4:3', '3:4'],
      }
    : {
        model: ['2.0', '2.5'],
        resolution: ['720p', '480p'],
        duration: [4, 5, 6, 7, 8],
        ratio: ['adaptive', '1:1', '16:9', '9:16'],
        mode: ['first_frame', 'first_last_frame', 'multi_modal_reference'],
      };
}

export function canvasParameterSchema() {
  const generation = (image: boolean) => ({
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(
      Object.entries(canvasGenerationParameterChoices(image)).map(([name, values]) => [
        name,
        {
          type: typeof values[0] === 'number' ? 'integer' : 'string',
          enum: values,
        },
      ])
    ),
  });
  return {
    description:
      'Optional update fields. Updates merge with existing settings; constraints apply to the merged settings. This schema does not guarantee execution readiness.',
    image: generation(true),
    mergeIcons: {
      type: 'object',
      description:
        'Image-card specialization. Replaces the complete settings; compiles the prompt and marks old results pending. Each series needs at least stageCount descriptions; empty descriptions are designed by the model. No paid generation is started by this update.',
      required: ['stageCount', 'instructions', 'series'],
      properties: {
        stageCount: { type: 'integer', minimum: 2, maximum: 33 },
        instructions: { type: 'string', maxLength: 400 },
        series: {
          type: 'array',
          minItems: 1,
          maxItems: 3,
          items: {
            type: 'object',
            required: ['name', 'stages'],
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 40 },
              stages: {
                type: 'array',
                minItems: 2,
                maxItems: 33,
                items: { type: 'string', maxLength: 60 },
              },
            },
          },
        },
      },
    },
    video: {
      ...generation(false),
      description:
        'Model 2.5 with first_frame or first_last_frame requires ratio adaptive. Applies to effective execution settings, including inferred mode; multi_modal_reference permits all listed ratios.',
      allOf: [
        {
          if: {
            properties: {
              model: { const: '2.5' },
              mode: { enum: ['first_frame', 'first_last_frame'] },
            },
            required: ['model', 'mode'],
          },
          then: { properties: { ratio: { const: 'adaptive' } } },
        },
      ],
    },
    sequence: {
      type: 'object',
      additionalProperties: false,
      description:
        'Requires an existing sequence card with sequenceSettings. Numbers must be finite. Frame count, atlas capacity and source constraints are also checked during execution.',
      properties: {
        start: { type: 'number', minimum: 0, exclusiveMaximum: 86400 },
        end: { type: 'number', exclusiveMinimum: 0, maximum: 86400 },
        fps: { type: 'number', minimum: 1, maximum: 30 },
        width: { type: 'integer', minimum: 1, maximum: 2048 },
        height: { type: 'integer', minimum: 1, maximum: 2048 },
        fit: { type: 'string', enum: ['contain', 'cover', 'stretch'] },
        pixel: { type: 'boolean' },
        cutout: { type: 'boolean' },
        cutoutMode: { type: 'string', enum: ['connected', 'chroma'] },
        backgroundColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
        tolerance: { type: 'number', minimum: 0, maximum: 255 },
      },
      'x-constraints': {
        interval: { left: 'end', operator: '>', right: 'start' },
        frameCount: { expression: 'ceil((end - start) * fps - 1e-8)', maximum: 120 },
      },
    },
  };
}

export type CanvasInfoNode = CanvasNode & {
  state?: {
    generation?: { status: string; canQuery: boolean };
    workflow?: string;
    sequence?: { status: string };
    imageAssets?: { status: string };
  };
};

export interface CanvasInfoSnapshot {
  id: string;
  revision: number;
  nodes: CanvasInfoNode[];
  edges: CanvasDocument['edges'];
  queues?: CanvasGroupQueueState[];
  templateFlow?: CanvasDocument['templateFlow'];
  source?: 'live' | 'saved';
  blocked?: string | null;
}

export interface CanvasSnapshotGuidance {
  nodeId: string;
  action: 'query' | 'check-upstream-and-run' | 'export' | 'set-references' | 'confirm-image-assets';
  reason: string;
}

export function selectCanvasSnapshot<Snapshot extends CanvasInfoSnapshot>(
  snapshot: Snapshot,
  id?: string
) {
  const target = id === undefined ? undefined : snapshot.nodes.find((node) => node.id === id);
  if (id !== undefined && !target) throw new Error('卡片或分组不存在：' + id);
  const targets = target
    ? snapshot.nodes.filter(
        (node) => node.id === id || (target.type === 'section' && node.sectionId === id)
      )
    : snapshot.nodes;
  const targetIds = new Set(targets.map((node) => node.id));
  const edges = target ? snapshot.edges.filter((edge) => targetIds.has(edge.to)) : snapshot.edges;
  const upstreamIds = [...new Set(edges.map((edge) => edge.from))].filter(
    (nodeId) => !targetIds.has(nodeId)
  );
  const includedIds = new Set([...targetIds, ...upstreamIds]);
  const nodes = snapshot.nodes.filter((node) => includedIds.has(node.id));
  const groupIds = new Set(
    nodes.flatMap((node) =>
      node.type === 'section' ? [node.id] : node.sectionId ? [node.sectionId] : []
    )
  );
  const skills = [
    ...new Set(
      snapshot.nodes
        .filter((node) => groupIds.has(node.id))
        .flatMap((node) => node.templateSkills || [])
    ),
  ];
  const selected = { ...snapshot, nodes, edges, skills };
  if (snapshot.queues)
    selected.queues = snapshot.queues.filter((queue) => !target || groupIds.has(queue.groupId));
  if (
    target &&
    snapshot.templateFlow &&
    [
      snapshot.templateFlow.imageId,
      snapshot.templateFlow.videoId,
      snapshot.templateFlow.sequenceId,
      snapshot.templateFlow.animationId,
    ].some((nodeId) => nodeId !== undefined && !includedIds.has(nodeId))
  )
    delete selected.templateFlow;

  const items: CanvasSnapshotGuidance[] = [];
  for (const node of targets) {
    const generation = snapshot.source === 'live' ? node.state?.generation : undefined;
    const add = (action: CanvasSnapshotGuidance['action'], reason: string) =>
      items.push({ nodeId: node.id, action, reason });
    if (
      snapshot.source === 'live' &&
      node.state?.imageAssets?.status === 'waiting_for_confirmation'
    ) {
      add(
        'confirm-image-assets',
        'Inspect the returned grid PNG first, then explicitly confirm with the current reviewId and revision; do not run again to confirm.'
      );
      continue;
    }
    if (generation?.canQuery) {
      add('query', 'The captured page state offers querying the original task; do not resubmit.');
      continue;
    }
    if (
      generation ||
      (snapshot.source === 'live' &&
        (node.state?.workflow === 'loading' || node.state?.sequence?.status === 'running'))
    )
      continue;
    if (node.templatePending) {
      add(
        'check-upstream-and-run',
        'Check current upstream results and page blockers before explicitly running; paid steps require authorization.'
      );
    } else if (
      node.assetPath &&
      (['image', 'video', 'video-source'].includes(node.type) ||
        (['sequence', 'animation'].includes(node.type) && node.frameSetInfo?.frames.length))
    ) {
      add('export', 'A result is recorded; use the resource export entry after its normal checks.');
    } else if (
      ['video', 'video-source'].includes(node.type) &&
      !node.generation?.referenceImagePaths?.length &&
      !edges.some(
        (edge) =>
          edge.to === node.id &&
          nodes.some((source) => source.id === edge.from && source.type === 'image')
      )
    ) {
      add(
        'set-references',
        'Connect image references and choose the video input mode before running.'
      );
    }
  }
  return {
    ...selected,
    scope: {
      kind: target ? (target.type === 'section' ? 'group' : 'node') : 'canvas',
      ...(target ? { id: target.id } : {}),
      targetIds: [...targetIds],
      upstreamIds,
      upstreamDepth: 1,
      queues: 'whole-matching-groups',
      readOnly: true,
    },
    guidance: {
      advisory: true,
      basis: snapshot.source || 'unspecified',
      requiresLiveInspection: snapshot.source !== 'live',
      description:
        'Hints from this snapshot only, not canRun guarantees. Recheck current page state, blockers and inputs before acting. Queue details and counts describe whole matching groups.',
      items,
    },
  };
}
