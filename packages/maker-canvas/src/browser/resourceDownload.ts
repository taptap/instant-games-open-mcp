import { canvasNeedsProcessing } from '../features/templateWorkflow.js';
import type { CanvasExportDelivery, CanvasExportResult } from './exportDelivery.js';
import type { CanvasDocument, CanvasNode, ImageAssetsInfo } from '../contracts.js';
import { canvasExportIdentity, canvasExportFilename } from '../features/exportNaming.js';
import { canvasExportFormats } from '../features/resourceExport.js';
import { encodeCanvasImage } from './imageExport.js';
import { createSequenceExportFromReader } from './sequenceExport.js';

export interface CanvasResourceExportHost {
  deliver: CanvasExportDelivery;
  mediaUrl(path: string): string;
  readSource(path: string, failure: string): Promise<Blob>;
  nextCode(): Promise<string>;
  validateBundle(document: CanvasDocument, nodeId: string): CanvasNode[];
  createBundle(
    document: CanvasDocument,
    nodeId: string,
    progress?: (message: string) => void
  ): Promise<Blob>;
  createImageAssets(info: ImageAssetsInfo): Promise<Blob>;
}

export async function downloadCanvasResourceWithHost(
  node: CanvasNode,
  format: string,
  host: CanvasResourceExportHost,
  progress?: (message: string) => void,
  identity = canvasExportIdentity(undefined, node),
  loop = true,
  sink?: (blob: Blob, filename: string) => Promise<void>,
  current?: CanvasDocument
): Promise<CanvasExportResult> {
  if (current && canvasNeedsProcessing(current, node))
    throw new Error('来源或参数已变化，请先处理再导出。');
  const bundle =
    ['section', 'resource-bundle'].includes(node.type) && format === 'bundle' && current;
  if (bundle) host.validateBundle(current, node.id);
  if (
    (!bundle &&
      !node.assetPath &&
      !(node.type === 'image-assets' && node.imageAssetsInfo?.items.length)) ||
    node.templatePending ||
    !canvasExportFormats(node, current).some((item) => item.format === format)
  )
    throw new Error('此卡片尚无可导出的生成结果。');
  const sequence = node.type === 'sequence' || node.type === 'animation';
  const assets = node.type === 'image-assets';
  if (sequence && !node.frameSetInfo?.frames.length)
    throw new Error('请先完成并保存序列帧结果，再导出。');
  const image = format === 'png' || format === 'jpg';
  const extension = image
    ? format
    : sequence || assets || bundle
      ? 'zip'
      : node.assetPath!.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    zip: 'application/zip',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
  };
  if (!extension || !types[extension]) throw new Error('当前视频格式暂不支持导出。');
  const mime = types[extension];
  const filename = canvasExportFilename(identity, format, extension, await host.nextCode());
  const folder = filename.slice(0, -(extension.length + 1));
  const produce = async (): Promise<Blob> => {
    if (image) return encodeCanvasImage(host.mediaUrl(node.assetPath!), format as 'png' | 'jpg');
    let blob: Blob;
    if (bundle) {
      blob = await host.createBundle(current, node.id, progress);
    } else if (sequence) {
      progress?.('正在准备序列帧导出包…');
      blob = await createSequenceExportFromReader(
        () => host.readSource(node.assetPath!, '图集读取失败，未导出文件。'),
        node.frameSetInfo!,
        format as 'atlas' | 'frames',
        folder,
        progress,
        {
          name:
            ({ 前: 'front', 后: 'back', 左: 'left', 右: 'right' } as Record<string, string>)[
              identity.direction
            ] || 'default',
          loop,
        }
      );
    } else if (assets) {
      blob = await host.createImageAssets(node.imageAssetsInfo!);
    } else {
      blob = await host.readSource(node.assetPath!, '视频读取失败，未导出文件，请重试。');
      if (!blob.size) throw new Error('视频文件为空，未导出文件。');
    }
    return blob;
  };
  const result: CanvasExportResult = sink
    ? (await sink(await produce(), filename), { status: 'saved' })
    : await host.deliver({ filename, mime, produce });
  if (result.status === 'saved') progress?.('导出完成：' + filename);
  else if (result.status === 'downloaded')
    progress?.('已发起下载：' + filename + '，请查看浏览器下载记录。');
  return result;
}
