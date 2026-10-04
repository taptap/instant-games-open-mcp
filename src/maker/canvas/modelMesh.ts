export interface CanvasModelMesh {
  positions: Float32Array;
  normals?: Float32Array;
  uv?: Float32Array;
  indices: Uint32Array;
}

export function readCanvasModelMesh(bytes: ArrayBuffer): CanvasModelMesh[] {
  const data = new DataView(bytes);
  let offset = 0;
  const take = (size: number) => {
    if (!Number.isSafeInteger(size) || size < 0 || offset + size > bytes.byteLength)
      throw new Error('模型数据不完整。');
    const start = offset;
    offset += size;
    return start;
  };
  const uint = () => data.getUint32(take(4), true);
  const count = (limit: number) => {
    const value = uint();
    if (value > limit) throw new Error('模型超出预览容量。');
    return value;
  };
  if (uint() !== 0x32444d55)
    throw new Error('目前旋转预览支持 Maker UMD2 模型，请导出后用引擎查看此格式。');
  const vertices: Array<Omit<CanvasModelMesh, 'indices'>> = [];
  let totalVertices = 0;
  for (let buffers = count(64); buffers > 0; buffers--) {
    const length = count(1000000);
    totalVertices += length;
    if (totalVertices > 1000000) throw new Error('模型顶点过多，无法预览。');
    const elements: Array<{ type: number; semantic: number; index: number; offset: number }> = [];
    let stride = 0;
    for (let remaining = count(32); remaining > 0; remaining--) {
      const packed = uint();
      const type = packed & 255;
      const size = [4, 4, 8, 12, 16, 4, 4][type];
      if (!size) throw new Error('不支持的模型顶点格式。');
      elements.push({
        type,
        semantic: (packed >>> 8) & 255,
        index: (packed >>> 16) & 255,
        offset: stride,
      });
      stride += size;
    }
    take(8);
    const start = take(length * stride);
    const attribute = (semantic: number, components: number, required = false) => {
      const element = elements.find((item) => item.semantic === semantic && item.index === 0);
      if (!element && !required) return undefined;
      if (!element || element.type !== components) throw new Error('模型缺少有效顶点属性。');
      const values = new Float32Array(length * components);
      for (let vertex = 0; vertex < length; vertex++) {
        for (let axis = 0; axis < components; axis++) {
          let value = data.getFloat32(start + vertex * stride + element.offset + axis * 4, true);
          if (!Number.isFinite(value)) throw new Error('模型包含无效坐标。');
          if (components === 3 && axis === 2) value = -value;
          values[vertex * components + axis] = value;
        }
      }
      return values;
    };
    vertices.push({
      positions: attribute(0, 3, true)!,
      normals: attribute(1, 3),
      uv: attribute(4, 2),
    });
  }
  const indices: Uint32Array[] = [];
  let totalIndices = 0;
  for (let buffers = count(64); buffers > 0; buffers--) {
    const length = count(6000000);
    totalIndices += length;
    if (totalIndices > 6000000) throw new Error('模型索引过多，无法预览。');
    const size = uint();
    if (size !== 2 && size !== 4) throw new Error('不支持的模型索引格式。');
    const start = take(length * size);
    const values = new Uint32Array(length);
    for (let index = 0; index < length; index++)
      values[index] =
        size === 2
          ? data.getUint16(start + index * size, true)
          : data.getUint32(start + index * size, true);
    indices.push(values);
  }
  const meshes: CanvasModelMesh[] = [];
  let previewIndices = 0;
  for (let geometries = count(128); geometries > 0; geometries--) {
    take(count(1024) * 4);
    const lods = count(64);
    if (!lods) throw new Error('模型缺少几何数据。');
    for (let lod = 0; lod < lods; lod++) {
      take(4);
      const primitive = uint();
      const vertex = vertices[uint()];
      const index = indices[uint()];
      const start = uint();
      const length = uint();
      if (!vertex || !index || start + length > index.length) throw new Error('模型几何索引越界。');
      if (lod !== 0) continue;
      previewIndices += length;
      if (primitive !== 0 || !length || length % 3 || previewIndices > 6000000)
        throw new Error('模型三角面数据无效或过大。');
      const selected = index.slice(start, start + length);
      for (let triangle = 0; triangle < length; triangle += 3) {
        const second = selected[triangle + 1];
        selected[triangle + 1] = selected[triangle + 2];
        selected[triangle + 2] = second;
        for (let corner = 0; corner < 3; corner++)
          if (selected[triangle + corner] >= vertex.positions.length / 3)
            throw new Error('模型顶点索引越界。');
      }
      meshes.push({ ...vertex, indices: selected });
    }
  }
  if (!meshes.length) throw new Error('模型中没有可显示的几何体。');
  return meshes;
}
