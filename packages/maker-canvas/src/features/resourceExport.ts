import type { CanvasDocument, CanvasNode } from '../contracts.js';
import { resourceBundleMembers } from './resourceBundle.js';

export function canvasExportFormats(
  node?: CanvasNode,
  current?: CanvasDocument
): Array<{ format: string; label: string }> {
  if (
    node &&
    ['section', 'resource-bundle'].includes(node.type) &&
    current &&
    resourceBundleMembers(current, node.id).length
  )
    return [
      {
        format: 'bundle',
        label:
          node.type === 'resource-bundle'
            ? '导出已完成素材（分类 ZIP）'
            : '下载全部素材（PNG ZIP）',
      },
    ];
  if (node?.type === 'image-assets') return [{ format: 'images', label: '独立 PNG 素材包' }];
  if (node?.type === 'model') return [{ format: 'model', label: 'Maker 模型包（含材质贴图）' }];
  if (!node || !['image', 'video', 'video-source', 'sequence', 'animation'].includes(node.type))
    return [];
  if (node.type === 'image')
    return [
      { format: 'png', label: 'PNG 图片' },
      { format: 'jpg', label: 'JPG 图片' },
    ];
  if (node.type === 'video' || node.type === 'video-source')
    return [{ format: 'video', label: '视频原文件' }];
  return [
    { format: 'atlas', label: 'Maker 图集包（推荐）' },
    { format: 'frames', label: 'Maker 单图包' },
  ];
}
