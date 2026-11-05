import fs from 'node:fs/promises';
import { projectCheckCapabilities } from './schema.js';
import { collectProjectCheck, publishProjectCheck, readProjectCheck } from './store.js';

export async function runProjectCheckCli(
  action: string | undefined,
  options: Record<string, string | boolean>,
  positionals: string[]
) {
  const print = (value: unknown) =>
    process.stdout.write(JSON.stringify(value, null, options.json ? undefined : 2) + '\n');
  try {
    const allowed: Record<string, string[]> = {
      capabilities: [],
      collect: ['target_dir'],
      show: ['target_dir'],
      publish: ['target_dir', 'input_file'],
    };
    if (!action || !Object.hasOwn(allowed, action) || positionals.length)
      throw new Error('使用 project-check capabilities|collect|publish|show。');
    for (const key of Object.keys(options))
      if (!['json', 'env', ...allowed[action]].includes(key))
        throw new Error('不支持的参数：--' + key.replace(/_/g, '-'));
    if (options.json !== undefined && typeof options.json !== 'boolean')
      throw new Error('--json 不接受字符串值。');
    if (action === 'capabilities') {
      print(projectCheckCapabilities);
      return;
    }
    if (typeof options.target_dir !== 'string')
      throw new Error('需要 --target-dir 指定已绑定项目的绝对路径。');
    if (action === 'collect') print(await collectProjectCheck(options.target_dir));
    else if (action === 'show') print({ result: readProjectCheck(options.target_dir) });
    else {
      if (typeof options.input_file !== 'string')
        throw new Error('需要 --input-file 指定 AI 分析 JSON。');
      const stat = await fs.stat(options.input_file);
      if (!stat.isFile() || stat.size > 4 * 1024 * 1024)
        throw new Error('分析文件必须小于 4 MiB。');
      const text = await fs.readFile(options.input_file, 'utf8');
      if (Buffer.byteLength(text) > 4 * 1024 * 1024) throw new Error('分析文件必须小于 4 MiB。');
      print(await publishProjectCheck(options.target_dir, JSON.parse(text.replace(/^\uFEFF/, ''))));
    }
  } catch (error) {
    if (!options.json) throw error;
    print({
      ok: false,
      error: {
        code: 'PROJECT_CHECK_FAILED',
        message: error instanceof Error ? error.message : String(error),
      },
    });
    process.exitCode = 1;
  }
}
