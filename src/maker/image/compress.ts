import fs from 'node:fs/promises';
import path from 'node:path';
import { constants, deflateSync, inflateSync } from 'node:zlib';
// @ts-expect-error pngjs does not ship declarations.
import pngjs from 'pngjs';

type Raster = { width: number; height: number; data: Buffer | Uint16Array };
const PNG = pngjs.PNG as {
  sync: {
    read(bytes: Buffer, options: { skipRescale: boolean }): Raster;
    write(image: Raster, options: Record<string, number>): Buffer;
  };
};
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_PIXELS = 16 * 1024 * 1024;
type Chunk = { type: string; bytes: Buffer; data: Buffer };

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function readChunks(bytes: Buffer): Chunk[] {
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) throw new Error('Only PNG input is supported.');
  const chunks: Chunk[] = [];
  let offset = 8;
  let ended = false;
  let idatEnded = false;
  let hasIdat = false;
  while (offset < bytes.length) {
    if (ended || bytes.length - offset < 12) throw new Error('Invalid PNG chunk layout.');
    const length = bytes.readUInt32BE(offset);
    const end = offset + length + 12;
    if (end > bytes.length) throw new Error('Truncated PNG chunk.');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type)) throw new Error('Invalid PNG chunk type.');
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4))
      throw new Error(`PNG checksum mismatch: ${type}.`);
    if (chunks.length === 0 && (type !== 'IHDR' || length !== 13))
      throw new Error('Invalid PNG header.');
    if (chunks.length > 0 && type === 'IHDR') throw new Error('Duplicate PNG header.');
    if (['acTL', 'fcTL', 'fdAT', 'dSIG'].includes(type))
      throw new Error('Animated or digitally signed PNG is not supported; input is unchanged.');
    if (type === 'IDAT') {
      if (idatEnded) throw new Error('Non-contiguous PNG image data.');
      hasIdat = true;
    } else if (hasIdat) idatEnded = true;
    if (type === 'IEND') {
      if (length !== 0) throw new Error('Invalid PNG end chunk.');
      ended = true;
    }
    chunks.push({
      type,
      bytes: bytes.subarray(offset, end),
      data: bytes.subarray(offset + 8, end - 4),
    });
    offset = end;
  }
  if (!ended || !hasIdat) throw new Error('Incomplete PNG image.');
  return chunks;
}

function imageData(chunks: Chunk[]): Buffer {
  return Buffer.concat(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data));
}

function replaceImageData(chunks: Chunk[], data: Buffer): Buffer {
  const idat = Buffer.alloc(data.length + 12);
  idat.writeUInt32BE(data.length);
  idat.write('IDAT', 4, 'ascii');
  data.copy(idat, 8);
  idat.writeUInt32BE(crc32(idat.subarray(4, -4)), idat.length - 4);
  const parts: Buffer[] = [SIGNATURE];
  let inserted = false;
  for (const chunk of chunks) {
    if (chunk.type !== 'IDAT') parts.push(chunk.bytes);
    else if (!inserted) {
      parts.push(idat);
      inserted = true;
    }
  }
  return Buffer.concat(parts);
}

function pixelBytes(image: Raster): Buffer {
  return Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);
}

/** Local, lossless PNG optimization. Does not write files or depend on Maker state. */
export function compressPng(bytes: Buffer): { bytes: Buffer; width: number; height: number } {
  if (bytes.length > MAX_FILE_BYTES) throw new Error('PNG input exceeds the 64 MiB limit.');
  const chunks = readChunks(bytes);
  const header = chunks[0].data;
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const depth = header[8];
  const colorType = header[9];
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType];
  const depths = colorType === 0 ? [1, 2, 4, 8, 16] : colorType === 3 ? [1, 2, 4, 8] : [8, 16];
  if (!channels || !depths.includes(depth) || header[10] !== 0 || header[11] !== 0)
    throw new Error('Unsupported PNG encoding.');
  if (header[12] !== 0) throw new Error('Interlaced PNG is not supported; input is unchanged.');
  if (!width || !height || width * height > MAX_PIXELS)
    throw new Error('PNG dimensions must be positive and at most 16,777,216 pixels.');
  const expectedBytes = (Math.ceil((width * channels * depth) / 8) + 1) * height;
  const scanlines = inflateSync(imageData(chunks), { maxOutputLength: expectedBytes });
  if (scanlines.length !== expectedBytes) throw new Error('Invalid PNG scanline length.');
  const original = PNG.sync.read(bytes, { skipRescale: true });
  let best = bytes;
  for (const strategy of [constants.Z_DEFAULT_STRATEGY, constants.Z_FILTERED]) {
    const compressed = deflateSync(scanlines, { level: 9, strategy });
    // Verify the exact samples, including 16-bit values and palette indices.
    if (!inflateSync(compressed, { maxOutputLength: expectedBytes }).equals(scanlines))
      throw new Error('PNG compression verification failed.');
    const candidate = replaceImageData(chunks, compressed);
    if (candidate.length < best.length) best = candidate;
  }
  // Refilter common RGB/RGBA images without changing their header or metadata.
  // tRNS decoding can discard hidden RGB, so those images only use recompression.
  if (depth === 8 && [2, 6].includes(colorType) && !chunks.some((chunk) => chunk.type === 'tRNS')) {
    const encoded = PNG.sync.write(original, {
      colorType,
      bitDepth: 8,
      deflateLevel: 9,
      deflateStrategy: 0,
    });
    const encodedChunks = readChunks(encoded);
    if (!encodedChunks[0].data.equals(header))
      throw new Error('PNG header changed during compression.');
    const candidate = replaceImageData(chunks, imageData(encodedChunks));
    if (candidate.length < best.length) best = candidate;
  }
  const verified = PNG.sync.read(best, { skipRescale: true });
  if (
    verified.width !== width ||
    verified.height !== height ||
    !pixelBytes(original).equals(pixelBytes(verified))
  )
    throw new Error('PNG pixels changed during compression; no output was written.');
  return { bytes: best, width, height };
}

export type ImageCompressionResult = {
  ok: true;
  status: 'compressed' | 'unchanged';
  input_path: string;
  output_path: string;
  original_bytes: number;
  output_bytes: number;
  saved_bytes: number;
  width: number;
  height: number;
  lossless_verified: true;
};

/** Creates a verified copy at a new path; never overwrites an existing file. */
export async function compressPngFile(
  inputPath: string,
  outputPath: string
): Promise<ImageCompressionResult> {
  const input = await fs.realpath(inputPath);
  const output = path.join(
    await fs.realpath(path.dirname(path.resolve(outputPath))),
    path.basename(outputPath)
  );
  if (path.extname(output).toLowerCase() !== '.png')
    throw new Error('Output must have a .png extension.');
  try {
    await fs.lstat(output);
    throw new Error('Output already exists. Choose a new path; files are never overwritten.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (!(await fs.stat(input)).isFile()) throw new Error('Input must be a regular PNG file.');
  const handle = await fs.open(input, 'r');
  let bytes: Buffer;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES)
      throw new Error('Input must be a regular PNG file no larger than 64 MiB.');
    const buffer = Buffer.alloc(stat.size + 1);
    let size = 0;
    while (size < buffer.length) {
      const read = await handle.read(buffer, size, buffer.length - size, size);
      if (!read.bytesRead) break;
      size += read.bytesRead;
    }
    if (size !== stat.size)
      throw new Error('Input size changed while reading; try a stable source file.');
    bytes = buffer.subarray(0, size);
  } finally {
    await handle.close();
  }
  const compressed = compressPng(bytes);
  const temporary = await fs.mkdtemp(path.join(path.dirname(output), '.maker-png-'));
  try {
    const staged = path.join(temporary, 'output.png');
    await fs.writeFile(staged, compressed.bytes, { flag: 'wx', mode: 0o600 });
    // Same-filesystem link publishes the completed file atomically and fails if it exists.
    await fs.link(staged, output);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
  return {
    ok: true,
    status: compressed.bytes.length < bytes.length ? 'compressed' : 'unchanged',
    input_path: input,
    output_path: output,
    original_bytes: bytes.length,
    output_bytes: compressed.bytes.length,
    saved_bytes: bytes.length - compressed.bytes.length,
    width: compressed.width,
    height: compressed.height,
    lossless_verified: true,
  };
}
