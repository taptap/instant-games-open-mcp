export const templateCategories = [
  '全部',
  '道具与种植',
  '角色与动画',
  'UI 设计',
  '3D 模型',
  '我的模板',
] as const;

export function templatePresentation(id: string) {
  const number = Number(id.slice(-3));
  const category = [5, 6, 9].includes(number)
    ? '道具与种植'
    : [7, 10].includes(number)
      ? 'UI 设计'
      : number === 4
        ? '3D 模型'
        : '角色与动画';
  const previews: Record<number, Array<{ index: number; label: string }>> = {
    4: [{ index: 0, label: '模型结果' }],
    5: [
      { index: 0, label: '游戏风格' },
      { index: 1, label: '道具图集' },
    ],
    6: [{ index: 1, label: '生长五阶段' }],
    7: [
      { index: 0, label: '设计参考' },
      { index: 1, label: '组件结果' },
    ],
    8: [
      { index: 0, label: '角色参考' },
      { index: 1, label: '八种职业' },
    ],
    9: [{ index: 1, label: '三系列 · 五阶段' }],
    10: [
      { index: 1, label: '温暖手绘' },
      { index: 2, label: '暗黑奇幻' },
    ],
    11: [
      { index: 0, label: '角色参考' },
      { index: 1, label: '概念展示' },
    ],
  };
  return { category, previews: previews[number], modelPreview: number === 4 };
}
