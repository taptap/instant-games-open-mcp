export type MediaRecoveryImage = {
  bytes: number;
  mimeType: string;
  width?: number;
  height?: number;
};

/** Inspect already embedded images only. No URL fetch, file writes or bitmap decoding. */
export function embeddedMediaDiagnostics(args: Record<string, unknown>): MediaRecoveryImage[] {
  const images: MediaRecoveryImage[] = [];
  const seen = new WeakSet<object>();
  let visited = 0;
  const visit = (value: unknown, depth: number) => {
    if (depth > 6 || visited++ >= 512 || images.length >= 32) return;
    if (typeof value === 'string') {
      const match = /^data:(image\/(?:png|jpeg|webp|gif|bmp));base64,/i.exec(value);
      if (!match) return;
      const encoded = value.slice(match[0].length);
      const header = Buffer.from(encoded.slice(0, 40), 'base64');
      let width: number | undefined, height: number | undefined;
      if (
        header.length >= 24 &&
        header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ) {
        width = header.readUInt32BE(16);
        height = header.readUInt32BE(20);
      } else if (
        header.length >= 30 &&
        header.toString('ascii', 0, 4) === 'RIFF' &&
        header.toString('ascii', 8, 12) === 'WEBP'
      ) {
        const tag = header.toString('ascii', 12, 16);
        if (tag === 'VP8X') {
          width = 1 + header.readUIntLE(24, 3);
          height = 1 + header.readUIntLE(27, 3);
        } else if (tag === 'VP8L') {
          const bits = header.readUInt32LE(21);
          width = (bits & 0x3fff) + 1;
          height = ((bits >>> 14) & 0x3fff) + 1;
        }
      }
      images.push({
        bytes: Buffer.byteLength(encoded, 'base64'),
        mimeType: match[1].toLowerCase(),
        width,
        height,
      });
    } else if (value && typeof value === 'object' && !seen.has(value)) {
      seen.add(value);
      for (const nested of Object.values(value)) {
        if (visited >= 512 || images.length >= 32) break;
        visit(nested, depth + 1);
      }
    }
  };
  visit(args, 0);
  return images;
}

/** Diagnostics are lazy and best-effort; the original error and execution state remain authoritative. */
export function mediaInputRecoveryHint(
  message: string,
  inspect?: () => MediaRecoveryImage[]
): string | undefined {
  if (!message.includes('Maximum call stack size exceeded')) return;
  let detail = '';
  try {
    const images = inspect?.() || [];
    if (images.length) {
      const total = images.reduce((sum, image) => sum + image.bytes, 0);
      const base64 = images.reduce((sum, image) => sum + 4 * Math.ceil(image.bytes / 3), 0);
      detail =
        '\n本次已知图片：' +
        images
          .map(
            (image, index) =>
              index +
              1 +
              '. ' +
              image.mimeType +
              '，' +
              image.bytes +
              ' 字节，' +
              (image.width && image.height ? image.width + '×' + image.height : '尺寸未确认')
          )
          .join('；') +
        '。解码后合计 ' +
        total +
        ' 字节，Base64 图片内容约 ' +
        base64 +
        ' 字节（不含 JSON/其它字段）。远端 URL 未读取。';
    }
  } catch {
    // Diagnostics must not hide or change an unknown paid outcome.
  }
  return (
    '本轮实测单图超过约 3 MB 时栈溢出风险较高，但图片体积不是已确认的唯一原因。' +
    '先核对原任务、结果和用量，再通过受控入口决定是否重新提交。' +
    '优先准备同尺寸、像素及 Alpha 不变且解码后不超过 2,500,000 字节的无损提交副本；' +
    '接口支持时可使用无损 WebP，或已可访问的 HTTP(S) 素材地址。' +
    '2.5 MB 是恢复建议目标，不是正常提交硬限制。注意 Base64/JSON 传输大小及多参考合计；' +
    '压缩不保证成功，不会自动重试。' +
    detail
  );
}
