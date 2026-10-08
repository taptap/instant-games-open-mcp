import { readCanvasModelMesh } from '../modelMesh.js';

function fixture() {
  const bytes = Buffer.alloc(256);
  let offset = 0;
  const uint = (value: number) => {
    bytes.writeUInt32LE(value, offset);
    offset += 4;
  };
  const float = (value: number) => {
    bytes.writeFloatLE(value, offset);
    offset += 4;
  };
  uint(0x32444d55);
  uint(1);
  uint(3);
  uint(2);
  uint(3);
  uint(0x402);
  uint(0);
  uint(0);
  for (const position of [
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
  ]) {
    position.forEach(float);
    float(0);
    float(0);
  }
  uint(1);
  uint(3);
  uint(4);
  uint(0);
  uint(1);
  uint(2);
  uint(1);
  uint(0);
  uint(1);
  float(0);
  uint(0);
  uint(0);
  uint(0);
  uint(0);
  uint(3);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + offset);
}

test('reads the first LOD and reflects both coordinates and winding into the browser coordinate system', () => {
  const result = readCanvasModelMesh(fixture());
  expect(result).toHaveLength(1);
  expect(Array.from(result[0].positions)).toEqual([0, 0, -1, 1, 0, -1, 0, 1, -1]);
  expect(Array.from(result[0].indices)).toEqual([0, 2, 1]);
  expect(result[0].uv).toHaveLength(6);
});

test('rejects truncated and unsupported data without allocating from unchecked counts', () => {
  expect(() => readCanvasModelMesh(fixture().slice(0, 30))).toThrow('不完整');
  const invalid = fixture();
  new DataView(invalid).setUint32(0, 0, true);
  expect(() => readCanvasModelMesh(invalid)).toThrow('UMD2');
  new DataView(invalid).setUint32(0, 0x32444d55, true);
  new DataView(invalid).setUint32(4, 0xffffffff, true);
  expect(() => readCanvasModelMesh(invalid)).toThrow('容量');
});

test('rejects invalid vertices and index references', () => {
  const invalid = fixture();
  new DataView(invalid).setFloat32(32, NaN, true);
  expect(() => readCanvasModelMesh(invalid)).toThrow('坐标');
  const badIndex = fixture();
  new DataView(badIndex).setUint32(104, 99, true);
  expect(() => readCanvasModelMesh(badIndex)).toThrow('索引越界');
});
