import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canvasExportDirectory, readCanvasImport, writeCanvasExport } from '../automationFiles.js';

let directory: string;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-files-'));
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

test('local imports require bounded regular files with supported extensions', () => {
  const filename = path.join(directory, '角色 图.PNG');
  fs.writeFileSync(filename, 'image bytes');
  expect(readCanvasImport(filename)).toMatchObject({
    kind: 'image',
    mime: 'image/png',
    title: '角色 图',
  });
  expect(() => readCanvasImport('relative.png')).toThrow('绝对路径');
  expect(() => readCanvasImport(path.join(directory, 'file.exe'))).toThrow('仅支持');
  fs.writeFileSync(filename, '');
  expect(() => readCanvasImport(filename)).toThrow('20 MiB');
  const folder = path.join(directory, 'folder.png');
  fs.mkdirSync(folder);
  expect(() => readCanvasImport(folder)).toThrow('20 MiB');
});

test('exports preserve existing files and never follow a conflicting symlink', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const first = writeCanvasExport(directory, '猫右.png', bytes);
  const second = writeCanvasExport(directory, '猫右.png', new Uint8Array([4]));
  expect(first).not.toBe(second);
  expect(fs.readFileSync(first)).toEqual(Buffer.from(bytes));
  expect(fs.readFileSync(second)).toEqual(Buffer.from([4]));
  if (process.platform !== 'win32') {
    fs.symlinkSync(first, path.join(directory, 'link.png'));
    expect(path.basename(writeCanvasExport(directory, 'link.png', bytes))).toBe('link-1.png');
  }
});

test.each(['../bad.png', 'CON.png', 'aux.zip', 'x:bad.png', 'bad.exe', 'bad.png.', 'bad.png '])(
  'rejects unsafe output filename %s',
  (filename) => {
    expect(() => writeCanvasExport(directory, filename, new Uint8Array([1]))).toThrow('文件名');
  }
);

test('export destination must exist and errors leave no partial file', () => {
  expect(() => canvasExportDirectory('relative')).toThrow('绝对目录');
  expect(() => canvasExportDirectory(path.join(directory, 'missing'))).toThrow();
  expect(() => writeCanvasExport(directory, 'empty.png', new Uint8Array())).toThrow('大小');
  const write = jest.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
    throw new Error('disk full');
  });
  try {
    expect(() => writeCanvasExport(directory, 'partial.png', new Uint8Array([1]))).toThrow(
      'disk full'
    );
  } finally {
    write.mockRestore();
  }
  expect(fs.existsSync(path.join(directory, 'partial.png'))).toBe(false);
});
