import fs from 'node:fs';
import type { CanvasImageInfo } from './imageSizing.js';

/** Read image headers only; no bitmap allocation, resampling or changes to user files. */
export function readImageDimensions(filename: string): CanvasImageInfo | undefined {
  const fd = fs.openSync(filename, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const read = (offset: number, count: number) => {
      if (offset < 0 || offset + count > size) throw new Error('图片头不完整。');
      const bytes = Buffer.alloc(count);
      if (fs.readSync(fd, bytes, 0, count, offset) !== count) throw new Error('图片头读取失败。');
      return bytes;
    };
    const header = read(0, Math.min(30, size));
    let width = 0,
      height = 0,
      orientation = 1;
    const exif = (data: Buffer) => {
      if (data.toString('ascii', 0, 6) === 'Exif\0\0') data = data.subarray(6);
      if (data.length < 8) return;
      const little = data.toString('ascii', 0, 2) === 'II';
      if (!little && data.toString('ascii', 0, 2) !== 'MM') return;
      const u16 = (p: number) => (little ? data.readUInt16LE(p) : data.readUInt16BE(p));
      const u32 = (p: number) => (little ? data.readUInt32LE(p) : data.readUInt32BE(p));
      const offset = u32(4);
      if (offset + 2 > data.length) return;
      for (let i = 0; i < u16(offset); i++) {
        const at = offset + 2 + i * 12;
        if (at + 12 > data.length) return;
        if (u16(at) === 0x112 && u16(at + 2) === 3 && u32(at + 4) === 1) orientation = u16(at + 8);
      }
    };
    if (
      header.length >= 24 &&
      header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      width = header.readUInt32BE(16);
      height = header.readUInt32BE(20);
      for (let at = 8; at + 12 <= size; ) {
        const chunk = read(at, 8),
          length = chunk.readUInt32BE(0),
          tag = chunk.toString('ascii', 4, 8);
        if (at + 12 + length > size || tag === 'IEND') break;
        if (tag === 'eXIf' && length <= 65536) exif(read(at + 8, length));
        at += 12 + length;
      }
    } else if (header[0] === 0xff && header[1] === 0xd8) {
      let at = 2;
      while (at + 4 <= size) {
        const marker = read(at, 2);
        if (marker[0] !== 0xff) break;
        if (marker[1] === 0xff) {
          at++;
          continue;
        }
        if (marker[1] === 0xda || marker[1] === 0xd9) break;
        if (marker[1] === 0x01 || (marker[1] >= 0xd0 && marker[1] <= 0xd7)) {
          at += 2;
          continue;
        }
        const length = read(at + 2, 2).readUInt16BE();
        if (length < 2 || at + 2 + length > size) break;
        if (
          [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
            marker[1]
          ) &&
          length >= 7
        ) {
          const frame = read(at + 4, 5);
          height = frame.readUInt16BE(1);
          width = frame.readUInt16BE(3);
        }
        if (marker[1] === 0xe1) exif(read(at + 4, length - 2));
        at += length + 2;
      }
    } else if (
      header.toString('ascii', 0, 4) === 'RIFF' &&
      header.toString('ascii', 8, 12) === 'WEBP'
    ) {
      for (let at = 12; at + 8 <= size; ) {
        const chunk = read(at, 8),
          tag = chunk.toString('ascii', 0, 4),
          length = chunk.readUInt32LE(4);
        if (at + 8 + length > size) break;
        if (tag === 'VP8X' && length >= 10) {
          const data = read(at + 8, 10);
          width = 1 + data.readUIntLE(4, 3);
          height = 1 + data.readUIntLE(7, 3);
        } else if (tag === 'VP8 ' && length >= 10 && !width) {
          const data = read(at + 8, 10);
          width = data.readUInt16LE(6) & 0x3fff;
          height = data.readUInt16LE(8) & 0x3fff;
        } else if (tag === 'VP8L' && length >= 5 && !width) {
          const bits = read(at + 8, 5).readUInt32LE(1);
          width = (bits & 0x3fff) + 1;
          height = ((bits >>> 14) & 0x3fff) + 1;
        } else if (tag === 'EXIF' && length <= 65536) exif(read(at + 8, length));
        at += 8 + length + (length % 2);
      }
    }
    if (!width || !height) return;
    return orientation >= 5 && orientation <= 8
      ? { width: height, height: width }
      : { width, height };
  } finally {
    fs.closeSync(fd);
  }
}
