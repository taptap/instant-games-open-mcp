export interface BackgroundOptions {
  tolerance: number;
  softness: number;
  despill: number;
  mode: 'all' | 'connected';
  automatic: boolean;
  color?: [number, number, number];
}

export function backgroundColorsDiffer(
  left: [number, number, number],
  right: [number, number, number],
  limit = 60
): boolean {
  return left.some((channel, index) => Math.abs(channel - right[index]) > limit);
}

export function stableBackgroundColor(
  colors: Array<[number, number, number] | undefined>,
  limit = 60
): [number, number, number] | undefined {
  const groups: {
    anchor: [number, number, number];
    sum: [number, number, number];
    count: number;
    last: number;
  }[] = [];
  colors.forEach((color, index) => {
    if (!color) return;
    const group = groups.find((item) => !backgroundColorsDiffer(item.anchor, color, limit));
    if (!group) {
      groups.push({ anchor: color, sum: [...color], count: 1, last: index });
      return;
    }
    group.count += 1;
    group.last = index;
    color.forEach((channel, channelIndex) => {
      group.sum[channelIndex] += channel;
    });
  });
  groups.sort((left, right) => right.count - left.count || right.last - left.last);
  const chosen = groups[0];
  if (!chosen) return;
  return chosen.sum.map((channel) => Math.round(channel / chosen.count)) as [
    number,
    number,
    number,
  ];
}

export function createBackgroundRemoval() {
  function detect(data: Uint8ClampedArray, width: number, height: number) {
    const buckets = new Map<string, { count: number; color: number[] }>();
    const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 16000)));
    let samples = 0;
    for (let row = 0; row < height; row += stride) {
      for (let column = 0; column < width; column += stride) {
        samples++;
        const offset = (row * width + column) * 4;
        if (data[offset + 3] < 240) continue;
        const color = Array.from(data.slice(offset, offset + 3));
        const key = color.map((channel) => Math.round(channel / 24)).join(',');
        const bucket = buckets.get(key) || { count: 0, color: [0, 0, 0] };
        bucket.count++;
        color.forEach((channel, index) => (bucket.color[index] += channel));
        buckets.set(key, bucket);
      }
    }
    const largest = [...buckets.values()].sort((left, right) => right.count - left.count)[0];
    if (!largest || largest.count / samples < 0.15) return undefined;
    const color = largest.color.map((channel) => Math.round(channel / largest.count)) as [
      number,
      number,
      number,
    ];
    const sides = [0, 0, 0, 0];
    const totals = [0, 0, 0, 0];
    for (let index = 0; index < Math.max(width, height); index += stride) {
      const pixels = [
        index < width ? index : -1,
        index < width ? (height - 1) * width + index : -1,
        index < height ? index * width : -1,
        index < height ? index * width + width - 1 : -1,
      ];
      pixels.forEach((pixel, side) => {
        if (pixel < 0) return;
        totals[side]++;
        if (
          data[pixel * 4 + 3] >= 240 &&
          color.every((channel, component) => Math.abs(data[pixel * 4 + component] - channel) <= 30)
        )
          sides[side]++;
      });
    }
    if (sides.filter((count, side) => count / totals[side] >= 0.3).length < 2) return undefined;
    return { color, coverage: largest.count / samples };
  }

  function process(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    settings: BackgroundOptions
  ) {
    if (data.length !== width * height * 4 || width < 1 || height < 1)
      throw new Error('帧像素尺寸无效。');
    const detected = settings.automatic ? detect(data, width, height) : undefined;
    const color = settings.automatic ? detected?.color : settings.color;
    if (!color)
      throw new Error('未可靠识别到大面积纯色背景，可能已经透明或背景过于复杂；原帧未改变。');
    if (
      settings.automatic &&
      settings.color &&
      color.some((channel, index) => Math.abs(channel - settings.color![index]) > 60)
    )
      throw new Error('该帧背景与预览帧差异较大，已停止批量处理，原帧集未改变。');
    const tolerance = Math.max(0, Math.min(150, settings.tolerance));
    const softness = Math.max(0, Math.min(80, settings.softness));
    const despill = Math.max(0, Math.min(1, settings.despill));
    const distance = (pixel: number) =>
      Math.max(...color.map((channel, index) => Math.abs(data[pixel * 4 + index] - channel)));
    let mask: Uint8Array | undefined;
    if (settings.mode === 'connected') {
      mask = new Uint8Array(width * height);
      const queue = new Int32Array(width * height);
      let read = 0;
      let write = 0;
      const visit = (pixel: number) => {
        if (mask![pixel] || (data[pixel * 4 + 3] && distance(pixel) > tolerance + softness)) return;
        mask![pixel] = 1;
        queue[write++] = pixel;
      };
      for (let column = 0; column < width; column++) {
        visit(column);
        visit((height - 1) * width + column);
      }
      for (let row = 0; row < height; row++) {
        visit(row * width);
        visit(row * width + width - 1);
      }
      while (read < write) {
        const pixel = queue[read++];
        if (pixel % width) visit(pixel - 1);
        if (pixel % width < width - 1) visit(pixel + 1);
        if (pixel >= width) visit(pixel - width);
        if (pixel + width < width * height) visit(pixel + width);
      }
    }
    for (let pixel = 0; pixel < width * height; pixel++) {
      if ((mask && !mask[pixel]) || !data[pixel * 4 + 3]) continue;
      const difference = distance(pixel);
      const alpha =
        difference <= tolerance
          ? 0
          : softness
            ? Math.min(1, (difference - tolerance) / softness)
            : 1;
      if (alpha === 1) continue;
      for (let channel = 0; channel < 3; channel++) {
        const original = data[pixel * 4 + channel];
        const cleaned = alpha > 0.01 ? (original - color[channel] * (1 - alpha)) / alpha : 0;
        data[pixel * 4 + channel] = alpha
          ? Math.max(0, Math.min(255, original + (cleaned - original) * despill))
          : 0;
      }
      data[pixel * 4 + 3] = Math.round(data[pixel * 4 + 3] * alpha);
    }
    return color;
  }

  async function read(blob: Blob) {
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('无法读取帧像素。');
      context.drawImage(bitmap, 0, 0);
      return { canvas, context, image: context.getImageData(0, 0, canvas.width, canvas.height) };
    } finally {
      bitmap.close();
    }
  }

  async function identify(blob: Blob) {
    const { image } = await read(blob);
    return detect(image.data, image.width, image.height);
  }

  async function apply(blob: Blob, settings: BackgroundOptions, signal?: AbortSignal) {
    if (signal?.aborted) throw new DOMException('处理已取消。', 'AbortError');
    const { canvas, context, image } = await read(blob);
    const color = process(image.data, image.width, image.height, settings);
    context.putImageData(image, 0, 0);
    const result = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('无法生成透明帧。'))),
        'image/png'
      )
    );
    if (signal?.aborted) throw new DOMException('处理已取消。', 'AbortError');
    return { blob: result, color };
  }
  return { detect, process, identify, apply };
}
