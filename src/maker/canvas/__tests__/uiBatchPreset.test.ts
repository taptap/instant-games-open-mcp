import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canvasPresets, builtinCanvasTemplates } from '../presets.js';
import { createCanvasTemplateModel } from '../templates.js';
import { MakerCanvasFiles } from '../files.js';
import { uiRecognitionInputs } from '../uiRecognition.js';
import { invalidateCanvasDependents } from '../templateWorkflow.js';

const id = '7e1cb6ad-732f-4dc3-a951-000000000013';

test('official UI catalog replaces the classified preset with the batch workflow', () => {
  const official = builtinCanvasTemplates().filter((item) => item.name === '游戏UI制作');
  expect(official.map((item) => item.id)).toEqual([id]);
  expect(builtinCanvasTemplates().some((item) => item.id.endsWith('000012'))).toBe(false);
  expect(canvasPresets().some((item) => item.id.endsWith('000012'))).toBe(false);
  const template = official[0];
  expect(template.nodes).toHaveLength(17);
  expect(template.skills).toEqual(['maker-ui-workflow']);
  const design = template.nodes.find((node) => node.uiRecognition?.inputRole === 'design')!;
  const cut = template.nodes.find((node) => node.uiRecognition?.inputRole === 'text-free')!;
  expect(template.edges.filter((edge) => edge.to === design.id)).toEqual([]);
  expect(template.edges.filter((edge) => edge.to === cut.id).map((edge) => edge.from)).toEqual([
    design.id,
  ]);
  for (const node of template.nodes.filter(
    (node) => node.type === 'image' && node.id !== design.id
  )) {
    expect(node.generation?.prompt || node.generationDraft?.prompt).toBeTruthy();
  }
});

test('batch preset imports, saves and reopens with one ready original and pending outputs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'maker-ui-batch-'));
  try {
    const files = new MakerCanvasFiles(root);
    const canvas = await files.create('UI batch');
    const prepared = await files.prepareTemplate(id, canvas.id);
    const instance = createCanvasTemplateModel().instantiate(prepared, { x: 0, y: 0 });
    const saved = await files.save(
      canvas.id,
      { ...canvas, nodes: instance.nodes, edges: instance.edges },
      canvas.revision
    );
    const reopened = await files.load(saved.id);
    const design = reopened.nodes.find((node) => node.uiRecognition?.inputRole === 'design')!;
    const cut = reopened.nodes.find((node) => node.uiRecognition?.inputRole === 'text-free')!;
    expect(design.templatePending).toBeUndefined();
    expect(cut.templatePending).toBe(true);
    expect(cut.uiRecognition?.results).toEqual([]);
    // Recognition becomes available after the existing image step completes.
    delete cut.templatePending;
    expect(uiRecognitionInputs(reopened, cut).design.id).toBe(design.id);
    for (const node of reopened.nodes) delete node.templatePending;
    invalidateCanvasDependents(reopened, design.id);
    expect(cut.templatePending).toBe(true);
    expect(
      reopened.nodes
        .filter((node) => node.type === 'image-assets')
        .every((node) => node.templatePending)
    ).toBe(true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 30000);
