export async function createCanvasZip(entries: Array<{ name: string; blob: Blob }>): Promise<Blob> {
  if (!entries.length || entries.length > 122) throw new Error('导出文件数量无效。');
  if (entries.reduce((size, entry) => size + entry.blob.size, 0) > 128 * 1024 * 1024)
    throw new Error('导出包超过 128 MiB，请减少帧数或尺寸后重试。');
  const encoder = new TextEncoder();
  const names = new Set<string>();
  const local: BlobPart[] = [];
  const central: ArrayBuffer[] = [];
  const crcTable = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    crcTable[index] = value;
  }
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    if (
      !name.length ||
      name.length > 65535 ||
      /[\\:]/.test(entry.name) ||
      Array.from(entry.name).some((character) => character.charCodeAt(0) < 32) ||
      entry.name.split('/').some((part) => !part || part === '.' || part === '..') ||
      names.has(entry.name)
    )
      throw new Error('导出文件名无效或重复。');
    names.add(entry.name);
    const bytes = new Uint8Array(await entry.blob.arrayBuffer());
    let crc = 0xffffffff;
    for (let index = 0; index < bytes.length; index++) {
      crc = crcTable[(crc ^ bytes[index]) & 255] ^ (crc >>> 8);
      if (index > 0 && index % 1048576 === 0)
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = new Uint8Array(30 + name.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x800, true);
    view.setUint16(12, 33, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, bytes.length, true);
    view.setUint32(22, bytes.length, true);
    view.setUint16(26, name.length, true);
    header.set(name, 30);
    const directory = new Uint8Array(46 + name.length);
    const record = new DataView(directory.buffer);
    record.setUint32(0, 0x02014b50, true);
    record.setUint16(4, 20, true);
    directory.set(header.subarray(4, 30), 6);
    record.setUint32(42, offset, true);
    directory.set(name, 46);
    local.push(header, entry.blob);
    central.push(directory.buffer);
    offset += header.length + bytes.length;
  }
  const end = new Uint8Array(22);
  const footer = new DataView(end.buffer);
  footer.setUint32(0, 0x06054b50, true);
  footer.setUint16(8, entries.length, true);
  footer.setUint16(10, entries.length, true);
  footer.setUint32(
    12,
    central.reduce((size, header) => size + header.byteLength, 0),
    true
  );
  footer.setUint32(16, offset, true);
  return new Blob([...local, ...central, end], { type: 'application/zip' });
}
