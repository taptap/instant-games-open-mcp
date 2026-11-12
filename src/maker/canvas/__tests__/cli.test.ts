import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCanvasCli } from '../cli.js';
import { canvasConsoleConnection } from '../../console/cli.js';

jest.mock('../../console/cli.js', () => ({ canvasConsoleConnection: jest.fn() }));

test('template import uses the archive service without a page and returns the new identity', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-template-import-'));
  const filename = path.join(root, 'template.zip');
  const bytes = Buffer.from([80, 75, 3, 4]);
  fs.writeFileSync(filename, bytes);
  const print = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
  const transfer = jest.fn(async () =>
    Response.json({ id: 'new-template', revision: 1, name: 'Room', skills: ['room-workflow'] })
  );
  jest.mocked(canvasConsoleConnection).mockResolvedValue({ transfer } as any);
  try {
    await runCanvasCli('import-template', { target_dir: root, file: filename });
    expect(transfer).toHaveBeenCalledWith('/templates/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/zip' },
      body: new Uint8Array(bytes),
    });
    expect(JSON.parse(String(print.mock.calls.at(-1)![0]))).toEqual({
      templateId: 'new-template',
      revision: 1,
      name: 'Room',
      skills: ['room-workflow'],
    });
    transfer.mockRejectedValueOnce(new Error('模板包哈希不匹配'));
    await expect(
      runCanvasCli('import-template', { target_dir: root, file: filename })
    ).rejects.toThrow('模板包哈希不匹配');
    expect(transfer).toHaveBeenCalledTimes(2);
    expect(fs.readFileSync(filename)).toEqual(bytes);
  } finally {
    print.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('template import rejects missing or unsupported files before connecting', async () => {
  const connect = jest.mocked(canvasConsoleConnection);
  connect.mockClear();
  for (const file of [undefined, true, 'relative.zip', '/tmp/template.png']) {
    await expect(
      runCanvasCli('import-template', {
        target_dir: '/tmp',
        ...(file !== undefined ? { file } : {}),
      })
    ).rejects.toThrow();
  }
  expect(connect).not.toHaveBeenCalled();
});

test('template export writes a named directory without a page and preserves existing files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-template-cli-'));
  const print = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
  const transfer = jest.fn(async () => new Response(new Uint8Array([80, 75, 3, 4])));
  const connect = jest.mocked(canvasConsoleConnection);
  connect.mockResolvedValue({ transfer } as any);
  const options = {
    target_dir: root,
    id: '02dad07d-1364-4228-b4bf-7f4149641254',
    revision: '1',
    output_dir: root,
  };
  try {
    fs.writeFileSync(path.join(root, 'template.zip'), 'existing');
    await runCanvasCli('export-template', options);
    const result = JSON.parse(String(print.mock.calls.at(-1)![0]));
    expect(result).toMatchObject({ templateId: options.id, revision: 1, size: 4 });
    expect(result.outputPath).toBe(path.join(fs.realpathSync(root), 'template-1.zip'));
    expect(fs.readFileSync(result.outputPath)).toEqual(Buffer.from([80, 75, 3, 4]));
    expect(fs.readFileSync(path.join(root, 'template.zip'), 'utf8')).toBe('existing');
    expect(transfer).toHaveBeenCalledWith('/templates/' + options.id + '/export?revision=1');
    transfer.mockRejectedValueOnce(new Error('模板已更新，请刷新列表。'));
    await expect(runCanvasCli('export-template', options)).rejects.toThrow('模板已更新');
    expect(fs.readdirSync(root)).toHaveLength(2);
    connect.mockClear();
    await expect(runCanvasCli('export-template', { ...options, revision: '0' })).rejects.toThrow(
      '--revision'
    );
    await expect(runCanvasCli('export-template', { ...options, output_dir: true })).rejects.toThrow(
      '--output-dir'
    );
    expect(connect).not.toHaveBeenCalled();
  } finally {
    print.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
