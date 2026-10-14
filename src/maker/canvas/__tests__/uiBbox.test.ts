import { randomUUID } from 'node:crypto';
import { scaleCutElements, validateUiBbox, type UiBboxDocument } from '../uiBbox.js';
import { bboxRecognitionElements, validateUiRecognition } from '../uiRecognition.js';
import { getCanvasPageHtml } from '../page.js';
import vm from 'node:vm';

export function bboxFixture(): UiBboxDocument {
  const design = {
    path: 'assets/image/canvas-' + randomUUID() + '.png',
    sha256: 'a'.repeat(64),
    width: 100,
    height: 200,
  };
  return {
    version: 1,
    coordinateSpace: 'design-pixels',
    bboxFormat: 'xywh',
    design,
    cutSource: {
      ...design,
      path: 'assets/image/canvas-' + randomUUID() + '.png',
      sha256: 'b'.repeat(64),
      width: 200,
      height: 400,
    },
    elements: [{ id: 'E001', name: '按钮', type: 'button', bbox: [10, 20, 80, 40], parent: null }],
    texts: [
      {
        id: 'T001',
        text: '确认',
        bbox: [20, 30, 60, 20],
        parentId: 'E001',
        role: 'button',
        align: 'center',
        color: '#F2D48A',
        bold: true,
        cutout: false,
      },
    ],
  };
}

test('Bbox is authoritative and cutout coordinates are derived in the text-free pixel space', () => {
  const bbox = bboxFixture();
  const result = {
    id: randomUUID(),
    model: 'GPT-6.1 Sol',
    prompt: 'two passes',
    createdAt: new Date().toISOString(),
    durationMs: 1,
    sourcePath: bbox.cutSource.path,
    sourceSha256: bbox.cutSource.sha256,
    width: 200,
    height: 400,
    elements: [],
    bbox,
  };
  const saved = validateUiRecognition({ enabled: true, results: [result] });
  expect(saved.results[0].elements[0]).toMatchObject({
    category: 'action',
    rect: [20, 40, 160, 80],
  });
  expect(saved.results[0].bbox?.texts[0].text).toBe('确认');
  expect(
    scaleCutElements(
      bboxRecognitionElements(bbox).map((element) => ({ ...bbox.elements[0], bbox: element.rect })),
      bbox.cutSource,
      bbox.design
    )[0].bbox
  ).toEqual([10, 20, 80, 40]);
});

test('preserves explicit duplicate links and positions without inferring from names', () => {
  const bbox = bboxFixture();
  bbox.texts = [];
  bbox.elements = [
    { id: 'E001', name: '金币', type: 'icon', bbox: [1, 1, 10, 10], parent: null },
    {
      id: 'E002',
      name: '金币实例',
      type: 'icon',
      bbox: [20, 1, 10, 10],
      parent: null,
      duplicateOf: 'E001',
    },
    { id: 'E003', name: '银币', type: 'icon', bbox: [1, 20, 10, 10], parent: null },
  ];
  expect(validateUiBbox(bbox).elements).toEqual(bbox.elements);
});

test.each(['parent', 'bounds', 'duplicate', 'text', 'format', 'cycle'])(
  'invalid Bbox %s is rejected',
  (failure) => {
    const bbox = bboxFixture();
    if (failure === 'parent') bbox.texts[0].parentId = 'E999';
    if (failure === 'bounds') bbox.texts[0].bbox = [99, 0, 10, 10];
    if (failure === 'duplicate') bbox.elements.push({ ...bbox.elements[0] });
    if (failure === 'text') (bbox.texts[0] as unknown as { cutout: boolean }).cutout = true;
    if (failure === 'format') (bbox as unknown as { bboxFormat: string }).bboxFormat = 'xyxy';
    if (failure === 'cycle') bbox.elements[0].parent = 'E001';
    expect(() => validateUiBbox(bbox)).toThrow();
  }
);

test('serialized browser validators include all Bbox dependencies', () => {
  const html = getCanvasPageHtml();
  const start = html.indexOf('const UI_CUT_TYPES');
  const helpers = html
    .slice(start, html.indexOf('(function ()', start))
    .replace(/\b[A-Za-z0-9_]+_js_\d+\./g, '')
    .replace(/\bexports\./g, '');
  const bbox = bboxFixture();
  expect(
    vm.runInNewContext(helpers + ';validateUiBboxStructure(input)', { input: bbox }).elements[0].id
  ).toBe('E001');
});
