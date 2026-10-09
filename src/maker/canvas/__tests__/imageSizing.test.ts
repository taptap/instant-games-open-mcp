import { uiRecognitionSource, selectedUiRecognition } from '../uiRecognition.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  imageRatioInfo,
  resolveImageSize,
  canvasOriginalImage,
  imageResultWarning,
} from '../imageSizing.js';
import { readImageDimensions } from '../imageDimensions.js';
import { upgradeUiWorkflowSizing, createUiWorkflowPreset } from '../uiWorkflowPresets.js';
import { emptyDocument, type CanvasNode } from '../model.js';
import { MakerCanvasFiles } from '../files.js';

test.each([
  [1920, 1080, '16:9'],
  [1080, 1920, '9:16'],
  [1600, 1200, '4:3'],
  [1200, 1600, '3:4'],
  [2520, 1080, '21:9'],
  [1080, 2520, '9:21'],
  [1919, 1080, '16:9'],
])('classifies %ix%i without losing original pixels', (width, height, expected) => {
  const info = { width: Number(width), height: Number(height) };
  expect(imageRatioInfo(info).common).toBe(expected);
  expect(info).toEqual({ width, height });
});

test('uncommon and unsupported portrait ratios stop source mode before submission, while fixed mode remains available', () => {
  expect(imageRatioInfo({ width: 1700, height: 1000 }).warning).toContain('非常见');
  expect(() => resolveImageSize('source', '1K', { width: 1700, height: 1000 })).toThrow('尚未提交');
  expect(() => resolveImageSize('source', '1K', { width: 900, height: 2100 })).toThrow('不支持');
  expect(resolveImageSize('16:9', '2K')).toMatchObject({ targetSize: '2048x1152' });
  expect(resolveImageSize('source', '2K', { width: 1080, height: 1920 }).targetSize).toBe(
    '1152x2048'
  );
  expect(resolveImageSize('21:9', '2K').targetSize).toBe('2048x878');
});

test('original stays anchored across generated intermediate images, and multiple roots are ambiguous', () => {
  const doc = emptyDocument();
  const make = (id: string): CanvasNode => ({
    id,
    type: 'image',
    title: id,
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    assetPath: id + '.png',
  });
  const original = make('original'),
    clean = make('clean'),
    marked = make('marked');
  doc.nodes = [original, clean, marked];
  doc.edges = [
    { id: 'a', from: original.id, to: clean.id, kind: 'image-variant' },
    { id: 'b', from: clean.id, to: marked.id, kind: 'image-variant' },
  ];
  expect(canvasOriginalImage(doc, marked)).toBe(original);
  const other = make('other');
  doc.nodes.push(other);
  doc.edges.push({ id: 'c', from: other.id, to: marked.id, kind: 'image-variant' });
  expect(canvasOriginalImage(doc, marked)).toBeUndefined();
  expect(imageResultWarning({ width: 576, height: 1024 }, '1024x576')).toContain('比例');
  expect(imageResultWarning({ width: 1920, height: 1080 }, '1024x576')).toBeUndefined();
});

test('legacy UI defaults migrate once; changed ratios and canvas geometry are preserved', () => {
  const preset = createUiWorkflowPreset();
  const group: CanvasNode = {
    id: 'group',
    type: 'section',
    title: 'UI',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    templateId: preset.id,
    templateRevision: 7,
  };
  const images = preset.nodes
    .filter((node) => node.generation?.parameters?.aspectRatio === 'source')
    .map((node) => ({ ...structuredClone(node), sectionId: group.id }));
  for (const node of images) node.generation!.parameters!.aspectRatio = '9:16';
  images[1].generation!.parameters!.aspectRatio = '4:3';
  const nodes = [group, ...images];
  const positions = nodes.map(({ x, y, width, height }) => ({ x, y, width, height }));
  upgradeUiWorkflowSizing({ nodes, edges: [] });
  expect(images[0].templatePending).toBe(true);
  expect(images[0].generation!.parameters!.aspectRatio).toBe('source');
  expect(images[1].generation!.parameters!.aspectRatio).toBe('4:3');
  images[0].generation!.parameters!.aspectRatio = '9:16';
  upgradeUiWorkflowSizing({ nodes, edges: [] });
  expect(images[0].generation!.parameters!.aspectRatio).toBe('9:16');
  expect(nodes.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual(positions);
});

test('header dimensions handle PNG, rotated JPEG and WebP, and stored imageInfo cannot override files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-size-'));
  try {
    const png = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
    png.write('IHDR', 12);
    png.writeUInt32BE(1920, 16);
    png.writeUInt32BE(1080, 20);
    const filename = path.join(root, 'header.png');
    fs.writeFileSync(filename, png);
    expect(readImageDimensions(filename)).toEqual({ width: 1920, height: 1080 });
    const exif = Buffer.alloc(32);
    exif.write('Exif', 0);
    exif.write('II', 6);
    exif.writeUInt16LE(42, 8);
    exif.writeUInt32LE(8, 10);
    exif.writeUInt16LE(1, 14);
    exif.writeUInt16LE(0x112, 16);
    exif.writeUInt16LE(3, 18);
    exif.writeUInt32LE(1, 20);
    exif.writeUInt16LE(6, 24);
    const app = Buffer.from([255, 225, 0, 34]);
    const jpeg = Buffer.concat([
      Buffer.from([255, 216]),
      app,
      exif,
      Buffer.from([255, 192, 0, 7, 8, 4, 56, 7, 128, 255, 217]),
    ]);
    fs.writeFileSync(filename, jpeg);
    expect(readImageDimensions(filename)).toEqual({ width: 1080, height: 1920 });
    const webp = Buffer.alloc(30);
    webp.write('RIFF');
    webp.writeUInt32LE(22, 4);
    webp.write('WEBP', 8);
    webp.write('VP8X', 12);
    webp.writeUInt32LE(10, 16);
    webp.writeUIntLE(1919, 24, 3);
    webp.writeUIntLE(1079, 27, 3);
    fs.writeFileSync(filename, webp);
    expect(readImageDimensions(filename)).toEqual({ width: 1920, height: 1080 });
    const files = new MakerCanvasFiles(root);
    const doc = await files.create('size', 'empty');
    const media = await files.importImage(png);
    doc.nodes.push({
      id: crypto.randomUUID(),
      type: 'image',
      title: 'source',
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      assetPath: media.relativePath,
      imageInfo: { width: 1, height: 1 },
    });
    expect((await files.save(doc.id, doc, doc.revision)).nodes[0].imageInfo).toEqual({
      width: 1920,
      height: 1080,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('UI recognition migration follows text-free output and leaves art text on original', () => {
  const preset = createUiWorkflowPreset();
  const doc = emptyDocument();
  doc.nodes = structuredClone(preset.nodes);
  doc.edges = structuredClone(preset.edges);
  const clean = doc.nodes.find((n) => n.title === '② 去文字设计稿')!;
  const original = doc.nodes.find((n) => n.id === doc.edges.find((e) => e.to === clean.id)!.from)!;
  const art = doc.nodes.find((n) => n.uiAnnotation?.includes('art_text'))!;
  const icons = doc.nodes.find((n) => n.uiAnnotation?.includes('icon'))!;
  const group = {
    id: 'group',
    type: 'section',
    title: 'UI',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    templateId: preset.id,
    templateRevision: 8,
  } as CanvasNode;
  for (const node of doc.nodes) node.sectionId = group.id;
  doc.nodes.push(group);
  delete clean.uiRecognition;
  original.uiRecognition = { enabled: true, results: [] };
  const note = doc.nodes.find((n) => n.uiRecognitionSourceId)!;
  note.uiRecognitionSourceId = original.id;
  const edges = JSON.stringify(doc.edges);
  upgradeUiWorkflowSizing(doc);
  expect(original.uiRecognition).toBeUndefined();
  expect(clean.uiRecognition?.enabled).toBe(true);
  expect(note.uiRecognitionSourceId).toBe(clean.id);
  expect(uiRecognitionSource(doc, icons)?.id).toBe(clean.id);
  expect(uiRecognitionSource(doc, art)).toBeUndefined();
  expect(doc.edges.find((e) => e.to === art.id)?.from).toBe(original.id);
  expect(JSON.stringify(doc.edges)).toBe(edges);
  expect(group.templateRevision).toBe(9);
  const migrated = JSON.stringify(doc);
  upgradeUiWorkflowSizing(doc);
  expect(JSON.stringify(doc)).toBe(migrated);
  clean.uiRecognition!.selectedId = 'old';
  clean.uiRecognition!.results = [{ id: 'old', sourcePath: clean.assetPath }] as any;
  expect(selectedUiRecognition(clean)).toBeDefined();
  clean.templatePending = true;
  expect(selectedUiRecognition(clean)).toBeUndefined();
});
