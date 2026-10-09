import type { CanvasDocument, CanvasNode } from './model.js';
import { configureMergeIcons } from './mergeIcons.js';
import { canvasOriginalImage, imageRatioInfo } from './imageSizing.js';
import { canvasGenerationParameterChoices, canvasParameterSchema } from './automationInfo.js';
import { imageCardSize } from './imageInfo.js';
import { uiRecognitionStatus, validateUiRecognition } from './uiRecognition.js';

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
      'width',
      'height',
      'prompt',
      'parameters',
      'sequenceSettings',
      'modelQuality',
      'mergeIcons',
      'uiRecognition',
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
        'Run a template group once with --allow-paid after user authorization. Images execute in dependency order, then resource cards split the current atlas with their saved grids and save final PNG items without per-card dialogs. Failed or unknown steps block only their dependent branch; independent branches continue. Definite image failures or uncuttable UI atlas layouts allow at most two paid regenerations per source per authorized group run; unknown tasks and download failures are never regenerated. Completion means prepared resource cards, not visual approval or installation into the game.',
      steps:
        'preview-image-assets -> inspect the returned grid preview -> confirm-image-assets -> export images',
      confirmation:
        'Preview/run on an image-assets card completes the command with result.status=waiting_for_confirmation, not final assets. Use the current reviewId and revision after visually checking every cell. New previews, edits and page reloads invalidate old confirmation. Game UI atlases with default grids use transparent separators for lossless alignment; explicit margins/gaps remain fixed. No semantic naming.',
    },
    templateSkills: {
      source: 'templates.presets/items[].skills and inspect.skills / section.templateSkills',
      instruction:
        'Before executing a template, read its associated Skills using the paths in Maker status or the current project Skill directories. If unavailable, report the missing Skill; do not claim to have followed it. Skills guide the Agent, not automatic console execution, and do not bypass review or paid-operation confirmation.',
    },
    uiWorkflow: {
      skill: 'maker-ui-workflow',
      imageSizing:
        'imageInfo reports actual image pixels and ratio, not card geometry. originalImage traces the unique original through existing references. Use parameters.aspectRatio=source for full-screen processing, or a supported fixed ratio for atlases. Uncommon input ratios carry warnings; unsupported source ratios stop before billing. Generation history separates referenceImages, originalImage, parameters.targetSize, resultImageInfo and submittedPrompt. Never infer actual dimensions from requested size.',
      recognition:
        'Canvas templates default recognition off. CLI run on a UI group or image enables recognition by default and completes it before downstream generation. Explicit no-recognition comparisons must pass input.recognition=false on run. First run the text-removal card. The calling AI then views its completed text-free output and saves its list using update-nodes nodes:[{id:TEXT_FREE_CARD_ID,uiRecognition:{enabled:true,result:RESULT}}]. RESULT fields: id(UUID), model(actual agent model or unknown), prompt, createdAt(ISO), durationMs, sourcePath, sourceSha256, width/height(text-free image pixels), elements:[{id,name,category,rect:[x,y,w,h],parentId,zIndex,states,cutout}]. Categories: icon,frame,tab,action,shortcut,close,title,panel,art_text,text. Art-text annotation/extraction stays on a separate original-image branch. No separate vision service or TAPTAP_MAKER_VISION_CONFIG required. If the current AI cannot view images, recommend switching its model.',
      steps:
        'design/layout -> reviewed PNG assets -> import into project -> generate_resource_meta -> assemble-ui.mjs -> console UI editor comparison',
      completion:
        'For an editable game UI request, PNG export is an intermediate result: the Agent continues with the Skill through assembly and editor verification. Stop at PNG only when the user requests extraction alone. Do not ask the user to copy a handoff prompt when the Agent is already operating the CLI.',
      boundary:
        'Enabled CLI recognition uses the calling AI and its saved element list; assembly remains a separate Skill task. Read every resource card and pending state; one successful export does not mean all assets or the UI are complete. Reuse verified layout records, or record layout from the design with explicit provenance before assembly.',
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
      run: {
        id: 'node or group ID',
        recognition:
          'optional boolean for UI groups/images; defaults true in CLI automation. Set false explicitly for a no-recognition comparison. The setting is saved to the source card; browser group buttons use the saved switch without applying this CLI default.',
      },
      'update-nodes': {
        nodes:
          'Array of patches with id and editable fields. width/height resize only the card, not the image or viewport (width 48..2000, height 36..1600; sections up to 100000). For image cards with known pixels, set width OR height and the other axis follows the image ratio including the header; if both are supplied they must match. Layout-only changes do not invalidate generated results.',
      },
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
    nodes: document.nodes.map((node) => {
      const original = node.type === 'image' ? canvasOriginalImage(document, node) : undefined;
      return {
        ...node,
        ...(node.uiRecognition ? { recognitionState: uiRecognitionStatus(node) } : {}),
        ...(node.uiRecognitionSourceId
          ? {
              text: uiRecognitionStatus(
                document.nodes.find((source) => source.id === node.uiRecognitionSourceId)
              ).text,
            }
          : {}),
        ...(node.imageInfo
          ? { imageInfo: { ...node.imageInfo, ...imageRatioInfo(node.imageInfo) } }
          : {}),
        ...(original?.imageInfo
          ? {
              originalImage: {
                nodeId: original.id,
                assetPath: original.assetPath,
                ...original.imageInfo,
                ...imageRatioInfo(original.imageInfo),
              },
            }
          : {}),
      };
    }),
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
      } else if (key === 'width' || key === 'height') {
        const min = key === 'width' ? 48 : 36;
        const max = node.type === 'section' ? 100000 : key === 'width' ? 2000 : 1600;
        if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
          throw new Error('卡片' + key + '必须为 ' + min + '～' + max + '。');
        next[key] = value;
      } else if (key === 'uiRecognition') {
        const settings = value as Record<string, unknown>;
        if (
          node.type !== 'image' ||
          !next.uiRecognition ||
          !settings ||
          typeof settings !== 'object' ||
          Array.isArray(settings) ||
          !Object.keys(settings).length ||
          Object.keys(settings).some((key) => !['enabled', 'model', 'result'].includes(key)) ||
          (settings.enabled !== undefined && typeof settings.enabled !== 'boolean') ||
          (settings.model !== undefined &&
            (typeof settings.model !== 'string' || !/^[a-zA-Z0-9_.-]{1,80}$/.test(settings.model)))
        )
          throw new Error('识图设置仅支持原稿卡的 enabled、model 和 result。');
        if (settings.enabled !== undefined)
          next.uiRecognition.enabled = settings.enabled as boolean;
        if (settings.model !== undefined) next.uiRecognition.model = settings.model as string;
        if (settings.result !== undefined) {
          if (node.templatePending || !node.assetPath)
            throw new Error('请先完成去文字，再识别当前去文字图并写入清单。');
          if (next.uiRecognition.pendingId) throw new Error('请先确认原识图请求结果。');
          const result = settings.result as import('./uiRecognition.js').UiRecognitionResult;
          if (!result || result.sourcePath !== node.assetPath)
            throw new Error('识图清单不属于当前原稿，请重新看图。');
          next.uiRecognition = validateUiRecognition({
            ...next.uiRecognition,
            enabled: settings.enabled !== false,
            results: [...next.uiRecognition.results, result],
            selectedId: result.id,
          });
          contentChanged = true;
        }
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
    if (
      (patch.width !== undefined || patch.height !== undefined) &&
      next.type === 'image' &&
      next.assetPath &&
      next.imageInfo
    ) {
      const requestedWidth =
        patch.width !== undefined
          ? next.width
          : ((next.height - 42) * next.imageInfo.width) / next.imageInfo.height + 2;
      const size = imageCardSize(requestedWidth, next.imageInfo.width, next.imageInfo.height);
      if (
        !size ||
        size.width < 48 ||
        (patch.width !== undefined && Math.abs(size.width - next.width) > 0.01) ||
        (patch.height !== undefined && Math.abs(size.height - next.height) > 0.01)
      )
        throw new Error(
          '图片卡片尺寸需符合原图比例及尺寸范围；请只设置 width 或 height，另一边自动适配。'
        );
      Object.assign(next, size);
    }
    if (contentChanged && next.generation && !next.generation.prompt.trim())
      throw new Error('此素材尚未保存提示词，请在同一次修改中提供 prompt。');
    if (['model', 'model-views'].includes(next.type)) delete next.templatePending;
    else if (contentChanged && next.sectionId) next.templatePending = true;
    return { node: next, contentChanged };
  });
}
