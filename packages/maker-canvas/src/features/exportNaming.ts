import type { CanvasDocument, CanvasNode } from '../contracts.js';
import { canvasReferences } from '../core/dependencies.js';

export function canvasExportIdentity(
  document: CanvasDocument | undefined,
  node: CanvasNode
): { title: string; direction: string } {
  const visited = new Set<string>();
  let current = node;
  let title = node.title;
  let direction = '';
  while (!visited.has(current.id)) {
    visited.add(current.id);
    if (!direction) {
      const labels: Record<string, string> = { front: '前', back: '后', left: '左', right: '右' };
      direction = current.exportDirection ? labels[current.exportDirection] || '' : '';
      if (!direction) {
        const matches = Array.from(current.title.matchAll(/向([前后左右])|([左右])侧|正面|背面/g));
        const directions = new Set(
          matches.map((match) => match[1] || match[2] || (match[0] === '正面' ? '前' : '后'))
        );
        if (directions.size === 1) direction = [...directions][0];
      }
    }
    if (!document) break;
    const sources = canvasReferences(document, current.id);
    if (!sources.length) {
      if (current.type === 'image') title = current.title;
      break;
    }
    const firstFrame = document.edges.find(
      (edge) => edge.to === current.id && ['first-frame', 'frame-first'].includes(edge.kind)
    );
    const preferredId =
      firstFrame?.from ||
      current.generation?.sourceImageId ||
      current.generationDraft?.sourceImageId;
    const preferred = sources.find((source) => source.id === preferredId);
    if (!preferred && sources.length !== 1) break;
    current = preferred || sources[0];
  }
  return { title, direction };
}

export function canvasExportFilename(
  identity: { title: string; direction: string },
  format: string,
  extension: string,
  code: string
): string {
  const source = identity.title.replace(/\.(png|jpe?g|webp|mp4|mov|webm|json|zip)$/i, '');
  const lastFullWidthClose = source.lastIndexOf('）');
  const lastAsciiClose = source.lastIndexOf(')');
  const parts: string[] = [];
  let start = 0;
  // Preserve first-closing-delimiter matching without rescanning unmatched openings.
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    const close =
      character === '（' && index < lastFullWidthClose
        ? source.indexOf('）', index + 1)
        : character === '(' && index < lastAsciiClose
          ? source.indexOf(')', index + 1)
          : -1;
    if (close < 0) continue;
    parts.push(source.slice(start, index));
    start = close + 1;
    index = close;
  }
  parts.push(source.slice(start));
  const title = parts
    .join('')
    .replace(/^\s*\d+[\s.、_-]*/, '')
    .replace(/生图参考|站姿参考|首帧|尾帧|首图|参考图/g, '')
    .replace(/^[\s·:：_-]+/, '')
    .replace(/·.*$/, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
  const kind =
    format === 'images' || format === 'bundle'
      ? '资'
      : format === 'atlas'
        ? '集'
        : format === 'frames'
          ? '帧'
          : format === 'video'
            ? '视'
            : '图';
  const limit = Math.min(
    3,
    15 - extension.length - 1 - code.length - kind.length - identity.direction.length
  );
  let subject = '';
  for (const character of title || '资源') {
    if (subject.length + character.length > limit) break;
    subject += character;
  }
  return subject + identity.direction + kind + code + '.' + extension;
}
