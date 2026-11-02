/** Size diagnostics for prepared Maker arguments; never retains media bytes or URLs. */
export type MediaInputInspection = {
  argumentsJsonBytes: number;
  embeddedBytes: number;
  items: Array<{ field: string; mime: string; decodedBytes: number; dataUrlBytes: number }>;
};

const SIZE_REFERENCE_BYTES = 2 * 1024 * 1024;

export function inspectMediaInput(args: Record<string, unknown>): MediaInputInspection {
  const inspection: MediaInputInspection = {
    // This measures tool arguments, not the later JSON-RPC envelope or auth metadata.
    argumentsJsonBytes: Buffer.byteLength(JSON.stringify(args)),
    embeddedBytes: 0,
    items: [],
  };
  const pending: Array<{ field: string; value: unknown }> = [{ field: '', value: args }];
  while (pending.length) {
    const { field, value } = pending.pop()!;
    if (typeof value === 'string' && /^data:/i.test(value)) {
      const comma = value.indexOf(',');
      if (comma < 0 || comma > 256) continue;
      const header = /^data:((?:image|video|audio)\/[a-z0-9.+-]+)(?:;[^,]*)?;base64$/i.exec(
        value.slice(0, comma)
      );
      if (!header) continue;
      const encoded = value.slice(comma + 1).replace(/\s/g, '');
      const decodedBytes = Buffer.byteLength(encoded, 'base64');
      inspection.items.push({
        field,
        mime: header[1].toLowerCase(),
        decodedBytes,
        dataUrlBytes: Buffer.byteLength(value),
      });
      inspection.embeddedBytes += decodedBytes;
    } else if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i--)
        pending.push({ field: `${field}[${i}]`, value: value[i] });
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value).reverse()) {
        // Unknown property names may themselves contain user data; expose only short identifiers.
        const safeKey = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(key) ? key : '[field]';
        pending.push({ field: field ? `${field}.${safeKey}` : safeKey, value: item });
      }
    }
  }
  return inspection;
}

export function mediaInputSizeNotice(inspection: MediaInputInspection): string | undefined {
  if (inspection.embeddedBytes <= SIZE_REFERENCE_BYTES) return;
  return (
    '请求体积检查：' +
    describeMediaInput(inspection) +
    '。2 MiB 仅为排查参考，不是服务上限；本次按原参数发送，不自动压缩或重试。'
  );
}

function describeMediaInput(inspection: MediaInputInspection): string {
  const large = inspection.items.filter((item) => item.decodedBytes > SIZE_REFERENCE_BYTES);
  const fields = inspection.items
    .slice(0, 8)
    .map((item) => `${item.field}=${item.decodedBytes} 字节`)
    .join('、');
  return (
    `${inspection.items.length} 项内嵌媒体，原文件字节合计 ${inspection.embeddedBytes}，` +
    `其中 ${large.length} 项单独超过 2 MiB；参数 JSON 为 ${inspection.argumentsJsonBytes} 字节` +
    (fields ? `（${fields}${inspection.items.length > 8 ? '，其余字段省略' : ''}）` : '')
  );
}

export function mediaInputRecoveryHint(
  message: string,
  inspection?: MediaInputInspection
): string | undefined {
  if (!inspection || !message.includes('Maximum call stack size exceeded')) return;
  const summary = '已检查本次实际发送参数：' + describeMediaInput(inspection) + '。';
  if (inspection.embeddedBytes <= SIZE_REFERENCE_BYTES)
    return (
      summary +
      '未发现单项或合计超过 2 MiB 的内嵌媒体；不能将此异常归因于大图。' +
      'HTTPS 引用不含远端文件字节，未下载检查其大小。请保留原始错误交服务端排查，' +
      '先核对原任务、产物和用量，不要自动重发。'
    );
  return (
    summary +
    '存在较大的单项或合计内嵌输入，但仅凭大小不能确认栈溢出原因；' +
    '2 MiB 不是已验证的单文件或请求总量上限。请将上述大小与原始错误交服务端排查。' +
    '如需缩小 PNG，可保留原图，用独立 CLI：' +
    'taptap-maker image compress --input "原图.png" --output "压缩副本.png" --json；' +
    '检查压缩结果，unchanged 表示未缩小，无损压缩不能保证达到指定体积。' +
    '已有可访问的 HTTPS 图片地址可避免内嵌 Base64 膨胀，但不保证远端读取成功。' +
    '不要自动上传、缩放、减色、转格式或重发；先核对原任务、产物和用量，' +
    '执行或计费状态无法确认时，由用户决定是否重新提交。'
  );
}
