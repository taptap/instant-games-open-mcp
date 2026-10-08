export function createFrameCollection() {
  function select(
    current: Set<number>,
    index: number,
    anchor: number,
    shift: boolean,
    toggle: boolean
  ) {
    if (shift) {
      const result = new Set(current);
      for (let position = Math.min(anchor, index); position <= Math.max(anchor, index); position++)
        result.add(position);
      return result;
    }
    if (!toggle) return new Set([index]);
    const result = new Set(current);
    if (result.has(index)) result.delete(index);
    else result.add(index);
    return result;
  }
  function change<Frame>(
    frames: readonly Frame[],
    selected: ReadonlySet<number>,
    action: 'delete' | 'duplicate' | 'reverse' | 'reduce',
    limit: number
  ) {
    let result: Frame[];
    if (action === 'delete') result = frames.filter((_frame, index) => !selected.has(index));
    else if (action === 'duplicate')
      result = frames.flatMap((frame, index) =>
        selected.has(index) ? [frame, { ...frame }] : [frame]
      );
    else if (action === 'reverse') result = [...frames].reverse();
    else result = frames.filter((_frame, index) => index % 2 === 0);
    if (!result.length) throw new Error('至少保留一帧。');
    if (result.length > limit)
      throw new Error('复制后超过当前帧数或图集容量上限（' + limit + ' 帧），请减少所选帧。');
    return result;
  }
  return { select, change };
}
