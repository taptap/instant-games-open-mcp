import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MakerCanvasFiles } from '../files.js';
import { canvasPresets } from '../presets.js';
import { templateAssetPaths } from '../templateArchive.js';
import { createCanvasTemplateModel, templateCoverSource } from '../templates.js';
import { createId } from '../model.js';
import { templatePresentation } from '../templatePresentation.js';
import { resourceBundleOwner } from '../resourceBundle.js';
import presetData from '../assetPresetData.json';
import { demoResourceInfo } from '../../demoResources.js';
import { formatMakerSkillStatus, resolveMakerSkillSourceDir } from '../../cli/skill.js';

const id = '7e1cb6ad-732f-4dc3-a951-000000000015';

test('official Bbox preset preserves tested prompts, media and final export layout', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-bbox-preset-'));
  try {
    const files = new MakerCanvasFiles(root);
    const preset = canvasPresets().find((item) => item.id === id)!;
    const original = presetData.find((item) => item.id === id)!;
    expect(preset.name).toBe('游戏UI制作 · Bbox预排参考图（实验）');
    expect(preset.skills).toEqual(['maker-ui-bbox-workflow']);
    expect(formatMakerSkillStatus()).toContain('maker-ui-bbox-workflow');
    expect(
      fs.existsSync(path.join(resolveMakerSkillSourceDir('maker-ui-bbox-workflow'), 'SKILL.md'))
    ).toBe(true);
    expect(preset.nodes).toHaveLength(22);
    expect(preset.nodes.filter((node) => node.uiAtlasPrelayout)).toHaveLength(6);
    for (const node of preset.nodes) {
      if (node.uiAtlasGroup) {
        expect(node.generation?.cutoutColor).toBe('transparent');
        expect(node.generation?.prompt).toContain('真实 Alpha 通道');
        expect(node.generation?.prompt).not.toMatch(/背景使用纯|抠图底色约定/);
      } else
        expect(node.generation?.prompt).toBe(
          original.nodes.find((item) => item.id === node.id)?.generation?.prompt
        );
    }
    expect(templatePresentation(id).category).toBe('UI 设计');
    expect(templateCoverSource({ ...preset, builtin: true }, 0)).toBe(
      preset.nodes.find((node) => node.title === '③ 去文字与元素识别')!.assetPath
    );
    expect(templateCoverSource({ ...preset, builtin: true }, 1)).toBeUndefined();
    const cover = templateCoverSource({ ...preset, builtin: true }, 0)!;
    const coverResource = demoResourceInfo(preset.assets[cover].resourceId);
    expect(coverResource.thumbnail).toBeTruthy();
    const preview = await files.readTemplatePreviewImage(
      id,
      preset.revision,
      preset.nodes.find((node) => node.assetPath === cover)!.id
    );
    expect(preview.bytes).toEqual(
      fs.readFileSync(
        path.join(
          process.cwd(),
          'resources/maker-demo',
          demoResourceInfo(coverResource.thumbnail!).file
        )
      )
    );
    const bundle = preset.nodes.find((node) => node.type === 'resource-bundle')!;
    const visibleNodes = preset.nodes.filter((node) => !resourceBundleOwner(preset, node.id));
    expect(visibleNodes).toHaveLength(16);
    expect(bundle.y).toBeGreaterThan(
      Math.max(
        ...visibleNodes.filter((node) => node !== bundle).map((node) => node.y + node.height)
      )
    );
    expect(templateAssetPaths(preset).every((file) => Boolean(preset.assets[file]))).toBe(true);
    expect(JSON.stringify(preset)).not.toMatch(/\.maker\/canvases\/|\/Users\//);
    const canvas = await files.create();
    const prepared = await files.prepareTemplate(id, canvas.id);
    for (const file of templateAssetPaths(prepared)) {
      expect(fs.statSync(path.join(root, file)).size).toBeGreaterThan(0);
    }
    expect(prepared.cliOnly).toBe(true);
    expect(prepared.nodes).toHaveLength(3);
    expect(prepared.nodes.flatMap((node) => node.imageAssetsInfo?.items || [])).toHaveLength(0);
    const instance = createCanvasTemplateModel(createId).instantiate(prepared, { x: 0, y: 0 });
    canvas.nodes = instance.nodes;
    canvas.edges = instance.edges;
    await files.save(canvas.id, canvas, canvas.revision);
    const reopened = await files.load(canvas.id);
    expect(reopened.nodes).toHaveLength(4);
    expect(reopened.nodes.find((node) => node.type === 'section')?.templateCliOnly).toBe(true);
    const snapshot = createCanvasTemplateModel().snapshot(reopened, [instance.section.id], 'copy');
    expect(snapshot.cliOnly).toBe(true);
    const saved = await files.saveTemplate(snapshot);
    expect(files.getTemplate(saved.id).cliOnly).toBe(true);
    expect(
      instance.nodes.filter((node) => node.uiAtlasPrelayout).every((node) => node.templatePending)
    ).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 60000);
