import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getMakerHome } from '../storage.js';
import { uiEditorConsoleConnection } from '../console/cli.js';
import { ConsoleError } from '../console/types.js';

export async function renderUiDocument(
  project: string,
  file: string,
  action: 'preview' | 'layout',
  options: Record<string, unknown>,
  outputFile?: string
) {
  if (outputFile !== undefined && (!path.isAbsolute(outputFile) || !outputFile.endsWith('.png')))
    throw new ConsoleError('--output-file 必须是绝对路径的 .png 文件，不覆盖已有文件。');
  const connection = await uiEditorConsoleConnection(project);
  let jobId: string | undefined;
  try {
    const submitted = await connection.request('submit', { file, action, options });
    jobId = submitted.id;
    const deadline = Date.now() + 50000;
    while (Date.now() < deadline) {
      const receipt = await connection.request(jobId + '/result');
      if (receipt.state === 'failed') throw new ConsoleError(receipt.error || '预览失败，请重试。');
      if (receipt.state === 'succeeded') {
        let image: string | undefined;
        if (action === 'preview') {
          const directory = path.join(getMakerHome(), 'ui-previews');
          if (!outputFile) await fs.mkdir(directory, { recursive: true });
          image = outputFile || path.join(directory, randomUUID() + '.png');
          const png = Buffer.from(receipt.png, 'base64');
          const handle = await fs.open(image, 'wx', 0o600);
          try {
            await handle.writeFile(png);
          } catch (error) {
            await handle.close();
            await fs.unlink(image).catch(() => {});
            throw error;
          }
          await handle.close();
        }
        return {
          ok: true,
          project,
          projectKey: connection.projectKey,
          file: receipt.file,
          source: receipt.source,
          revision: receipt.revision,
          ...receipt.result,
          image,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new ConsoleError('预览超时，请保持 UI 编辑器打开后重试。', 408);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST')
      throw new ConsoleError('输出文件已存在，未覆盖；请更换 --output-file。', 409);
    if (code === 'ENOENT') throw new ConsoleError('输出目录不存在，请先创建目录后重试。');
    if (code === 'EACCES' || code === 'EPERM')
      throw new ConsoleError('输出目录不可写，请更换 --output-file。', 403);
    if (error instanceof ConsoleError)
      throw new ConsoleError(error.message + ' 编辑器地址：' + connection.url, error.status);
    throw error;
  } finally {
    if (jobId) await connection.request(jobId + '/release', {}).catch(() => {});
  }
}
