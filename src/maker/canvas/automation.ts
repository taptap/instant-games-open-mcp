import type { CanvasDocument, CanvasNode } from './model.js';
import { configureMergeIcons } from './mergeIcons.js';
import { canvasGenerationParameterChoices, canvasParameterSchema } from './automationInfo.js';

export interface CanvasCommand {
  requestId: string;
  pageId: string;
  canvasId: string;
  revision?: number;
  action: string;
  input: Record<string, unknown>;
  allowPaid?: boolean;
}

export interface CanvasOperation {
  id: string;
  pageId: string;
  canvasId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown';
  createdAt: number;
  updatedAt: number;
  result?: unknown;
  resultExpired?: boolean;
  error?: string;
}

export function canvasAutomationCapabilities() {
  return {
    actions: [
      'inspect',
      'create',
      'open',
      'rename',
      'add-template',
      'add-node',
      'update-nodes',
      'delete-nodes',
      'duplicate',
      'group',
      'connect',
      'disconnect',
      'run',
      'stop',
      'query',
      'import',
      'set-references',
      'confirm-model',
      'preview-model',
      'preview-image-assets',
      'confirm-image-assets',
      'export',
    ],
    nodeTypes: ['image', 'video', 'note', 'sequence', 'animation', 'model-views', 'model'],
    editable: [
      'title',
      'text',
      'x',
      'y',
      'prompt',
      'parameters',
      'sequenceSettings',
      'modelQuality',
      'mergeIcons',
    ],
    modelWorkflow: {
      quality: ['fast', 'balanced', 'high_quality'],
      steps:
        'character image -> run model-views with --allow-paid -> query -> show ALL previews -> explicit user approval -> confirm-model with --allow-paid -> query',
      confirmation:
        'Never approve automatically or use group run to bypass review. confirm-model requires the current reviewId from inspect state.model or models. Final model paths are already inside assets/model.',
      history:
        'canvas models --canvas-id ID reads persisted local attempts without a page; query on model cards contacts the original upstream task.',
    },
    imageAssetsWorkflow: {
      groupRun:
        'Run a template group once with --allow-paid after user authorization. Images execute in dependency order, then resource cards split the current atlas with their saved grids and save final PNG items without per-card dialogs. Missing/invalid grids or failed/unknown steps pause the group; no automatic paid retry. Completion means prepared resource cards, not visual approval or installation into the game.',
      steps:
        'preview-image-assets -> inspect the returned grid preview -> confirm-image-assets -> export images',
      confirmation:
        'Preview/run on an image-assets card completes the command with result.status=waiting_for_confirmation, not final assets. Use the current reviewId and revision after visually checking every cell. New previews, edits and page reloads invalidate old confirmation. No automatic grid repair or semantic naming.',
    },
    templateSkills: {
      source: 'templates.presets/items[].skills and inspect.skills / section.templateSkills',
      instruction:
        'Before executing a template, read its associated Skills using the paths in Maker status or the current project Skill directories. If unavailable, report the missing Skill; do not claim to have followed it. Skills guide the Agent, not automatic console execution, and do not bypass review or paid-operation confirmation.',
    },
    uiWorkflow: {
      skill: 'maker-ui-workflow',
      steps:
        'design/layout -> reviewed PNG assets -> import into project -> generate_resource_meta -> assemble-ui.mjs -> console UI editor comparison',
      completion:
        'For an editable game UI request, PNG export is an intermediate result: the Agent continues with the Skill through assembly and editor verification. Stop at PNG only when the user requests extraction alone. Do not ask the user to copy a handoff prompt when the Agent is already operating the CLI.',
      boundary:
        'The console does not invoke AI. Read every resource card and pending state; one successful export does not mean all assets or the UI are complete. Reuse verified layout records, or record layout from the design with explicit provenance before assembly.',
    },
    sequenceSettings: [
      'start',
      'end',
      'fps',
      'width',
      'height',
      'fit',
      'pixel',
      'cutout',
      'cutoutMode',
      'backgroundColor',
      'tolerance',
    ],
    unsupported: [
      'brush',
      'per-frame-editing',
      'automatic-duplicate-removal',
      'headless-execution',
      'template-library-mutation',
    ],
    requiresConnectedPage: true,
    paidExecutionRequiresAllowPaid: true,
    parameterSchema: canvasParameterSchema(),
    inputs: {
      'preview-image-assets': {
        id: 'image-assets card ID; read-only preview, no final files',
        grid: 'optional object: columns/rows positive integers (at most 120 cells); marginX/marginY/gapX/gapY nonnegative integer pixels; omitted fields use saved/default grid',
      },
      'confirm-image-assets': {
        id: 'image-assets card ID',
        reviewId: 'current preview token; only confirm after inspecting the returned grid image',
      },
      'preview-model': {
        id: 'completed model card ID; opens read-only rotation preview, no paid request',
      },
      inspect: { id: 'optional node or group ID; includes direct upstream' },
      'confirm-model': {
        id: 'model card ID',
        reviewId: 'current review token; requires explicit user approval of all returned previews',
      },
      import: { file: 'CLI --file: absolute local path', title: 'optional title in input JSON' },
      'set-references': {
        id: 'target image/video ID',
        sourceIds: 'ordered image IDs; [] clears',
        includeSelf: 'optional boolean, image only; default false',
      },
      'add-node': {
        type: 'image/video/note/sequence/animation/model-views/model',
        sourceId: 'required for sequence/animation/model-views/model',
      },
      export: {
        id: 'result node ID',
        format: 'png/jpg/video/atlas/frames/model/images',
        loop: 'optional boolean; default true',
      },
      download: {
        operationId: 'CLI --operation-id',
        outputDir: 'CLI --output-dir: existing absolute directory',
      },
    },
    exportFormats: {
      'image-assets': ['images'],
      model: ['model'],
      image: ['png', 'jpg'],
      video: ['video'],
      sequence: ['atlas', 'frames'],
      animation: ['atlas', 'frames'],
    },
  };
}

export function validateCanvasCommand(value: unknown): CanvasCommand {
  const command = value as CanvasCommand;
  if (!command || typeof command !== 'object' || Array.isArray(command))
    throw new Error('命令必须是 JSON 对象。');
  for (const key of Object.keys(command))
    if (
      !['requestId', 'pageId', 'canvasId', 'revision', 'action', 'input', 'allowPaid'].includes(key)
    )
      throw new Error('不支持的命令字段：' + key);
  for (const key of ['requestId', 'pageId', 'canvasId'] as const)
    if (typeof command[key] !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(command[key]))
      throw new Error('缺少或无效的 ' + key);
  if (!canvasAutomationCapabilities().actions.includes(command.action))
    throw new Error('不支持的画布操作。请先查询 capabilities。');
  if (!command.input || typeof command.input !== 'object' || Array.isArray(command.input))
    throw new Error('input 必须是 JSON 对象。');
  if (command.allowPaid !== undefined && typeof command.allowPaid !== 'boolean')
    throw new Error('allowPaid 必须是布尔值。');
  if (
    !['inspect', 'stop', 'query'].includes(command.action) &&
    (!Number.isSafeInteger(command.revision) || command.revision! < 0)
  )
    throw new Error('操作前请 inspect，并传入当前 revision。');
  return command;
}

export function canvasAutomationSnapshot(document: CanvasDocument) {
  return {
    id: document.id,
    title: document.title,
    revision: document.revision,
    nodes: document.nodes.map((node) => ({ ...node })),
    edges: document.edges,
    templateFlow: document.templateFlow,
    skills: [...new Set(document.nodes.flatMap((node) => node.templateSkills || []))],
  };
}

export function prepareCanvasNodeUpdates(document: CanvasDocument, input: Record<string, unknown>) {
  if (
    Object.keys(input).some((key) => key !== 'nodes') ||
    !Array.isArray(input.nodes) ||
    !input.nodes.length ||
    input.nodes.length > 100
  )
    throw new Error('nodes 必须包含 1～100 个卡片修改。');
  const seen = new Set<string>();
  return input.nodes.map((value) => {
    const patch = value as Record<string, unknown>;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch))
      throw new Error('卡片修改无效。');
    const node = document.nodes.find((node) => node.id === patch.id);
    if (!node || seen.has(node.id)) throw new Error('卡片不存在或重复。');
    seen.add(node.id);
    const next: CanvasNode = JSON.parse(JSON.stringify(node));
    let contentChanged = false;
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'id') continue;
      if (key === 'title' || key === 'text') {
        if (
          typeof value !== 'string' ||
          !value.trim() ||
          value.length > (key === 'title' ? 80 : 4000) ||
          (key === 'text' && node.type !== 'note')
        )
          throw new Error('标题或便签内容无效。');
        next[key] = value;
      } else if (key === 'x' || key === 'y') {
        if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 100000)
          throw new Error('卡片位置无效。');
        if (node.type === 'section') throw new Error('首版不支持移动整个分组。');
        next[key] = value;
      } else if (key === 'mergeIcons') {
        configureMergeIcons(next, value);
        contentChanged = true;
      } else if (key === 'modelQuality') {
        if (
          node.type !== 'model-views' ||
          !['fast', 'balanced', 'high_quality'].includes(String(value))
        )
          throw new Error('模型质量只能在多视图卡上设置为 fast、balanced 或 high_quality。');
        next.modelQuality = value as CanvasNode['modelQuality'];
        contentChanged = true;
      } else if (key === 'prompt' || key === 'parameters') {
        if (!['image', 'video', 'video-source'].includes(node.type))
          throw new Error('此卡片没有生成参数。');
        if (next.assetPath) next.generation ||= { prompt: '' };
        else next.generationDraft ||= { operation: 'generate' };
        const settings = next.assetPath ? next.generation! : next.generationDraft!;
        if (key === 'prompt') {
          if (next.mergeIcons) throw new Error('二合图标提示词由阶段设置生成，请修改 mergeIcons。');
          if (typeof value !== 'string' || !value.trim() || value.length > 8000)
            throw new Error('提示词必须为 1～8000 字符。');
          settings.prompt = value;
        } else {
          if (!value || typeof value !== 'object' || Array.isArray(value))
            throw new Error('生成参数无效。');
          const image = node.type === 'image';
          const choices = canvasGenerationParameterChoices(image);
          for (const [name, setting] of Object.entries(value))
            if (!choices[name]?.includes(setting)) throw new Error('不支持的生成参数：' + name);
          settings.parameters = { ...settings.parameters, ...value };
          if (
            node.videoInputMode === 'first_last_frame' &&
            settings.parameters.mode !== undefined &&
            settings.parameters.mode !== 'first_last_frame'
          )
            throw new Error('此视频固定使用首尾帧模式。');
        }
        contentChanged = true;
      } else if (key === 'sequenceSettings') {
        if (
          node.type !== 'sequence' ||
          !node.sequenceSettings ||
          !value ||
          typeof value !== 'object' ||
          Array.isArray(value)
        )
          throw new Error('此卡片不能修改抽帧参数。');
        for (const name of Object.keys(value))
          if (!canvasAutomationCapabilities().sequenceSettings.includes(name))
            throw new Error('首版不支持的抽帧参数：' + name);
        const settings = { ...node.sequenceSettings, ...value };
        if (
          ![
            settings.start,
            settings.end,
            settings.fps,
            settings.width,
            settings.height,
            settings.tolerance,
          ].every(Number.isFinite) ||
          settings.start < 0 ||
          settings.end <= settings.start ||
          settings.end > 86400 ||
          settings.fps < 1 ||
          settings.fps > 30 ||
          Math.ceil((settings.end - settings.start) * settings.fps - 1e-8) > 120 ||
          !Number.isInteger(settings.width) ||
          !Number.isInteger(settings.height) ||
          settings.width < 1 ||
          settings.width > 2048 ||
          settings.height < 1 ||
          settings.height > 2048 ||
          typeof settings.cutout !== 'boolean' ||
          typeof settings.pixel !== 'boolean' ||
          !['contain', 'cover', 'stretch'].includes(settings.fit) ||
          (settings.cutoutMode !== undefined &&
            !['connected', 'chroma'].includes(settings.cutoutMode)) ||
          typeof settings.backgroundColor !== 'string' ||
          !/^#[0-9a-f]{6}$/i.test(settings.backgroundColor) ||
          settings.tolerance < 0 ||
          settings.tolerance > 255
        )
          throw new Error('抽帧参数超出支持范围。');
        next.sequenceSettings = settings;
        contentChanged = true;
      } else throw new Error('不支持的卡片字段：' + key);
    }
    if (contentChanged && next.generation && !next.generation.prompt.trim())
      throw new Error('此素材尚未保存提示词，请在同一次修改中提供 prompt。');
    if (['model', 'model-views'].includes(next.type)) delete next.templatePending;
    else if (contentChanged && next.sectionId) next.templatePending = true;
    return { node: next, contentChanged };
  });
}
