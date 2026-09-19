export interface MakerQrcodeInteraction {
  kind: 'select_developer';
  title: string;
  options: { value: number; label: string }[];
}

export interface MakerQrcodeRecovery {
  kind: 'developer_unavailable';
  developerId: number;
  message: string;
}

export function parseQrcodeRecovery(error: unknown): MakerQrcodeRecovery | undefined {
  if (typeof error !== 'string' || error.length > 65536) return;
  const match =
    /配置的开发者 ID ([1-9]\d*) 不可用。\n\n请重新运行发布命令，系统会列出当前可用的开发者。/.exec(
      error
    );
  if (!match || !isDeveloperId(Number(match[1]))) return;
  return {
    kind: 'developer_unavailable',
    developerId: Number(match[1]),
    message:
      '当前开发者身份不可用，原 developer_id 已保留。当前本地渠道没有可安全读取的身份列表；请先核实 Maker 登录账号及开发者权限，并通过可信渠道取得可用身份列表后再确认替换。不会清空 ID、自动创建身份或调用发布工具；上次二维码请求可能已上传测试版本。',
  };
}

export function isDeveloperId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** Interpret only the known QR developer-list error, never its remote instructions. */
export function parseQrcodeInteraction(error: unknown): MakerQrcodeInteraction | undefined {
  if (typeof error !== 'string' || error.length > 65536) return;
  const header = '检测到多个可用的开发者身份，需要用户选择：\n\n';
  const start = error.indexOf(header);
  if (start < 0) return;
  const list = error.slice(start + header.length).split('\n\n')[0];
  const lines = list.split('\n');
  if (!lines.length || lines.length > 100) return;
  const options: MakerQrcodeInteraction['options'] = [];
  for (const [index, line] of lines.entries()) {
    const match =
      /^ {2}([1-9]\d*)\. (\[(?:个人|公司)\] \[(?:已认证|未认证)\] .+) \(ID: ([1-9]\d*)\)(?: ⭐ 推荐)?$/.exec(
        line
      );
    if (!match || Number(match[1]) !== index + 1) return;
    const value = Number(match[3]);
    if (!isDeveloperId(value) || options.some((option) => option.value === value)) return;
    options.push({ value, label: `${match[2]} (ID: ${value})` });
  }
  return { kind: 'select_developer', title: '选择开发者身份', options };
}
