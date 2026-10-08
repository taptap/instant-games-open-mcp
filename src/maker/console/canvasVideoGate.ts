import fs from 'node:fs';
import { ConsoleError } from './types.js';
import type { CanvasGenerationAttempt } from './canvasGeneration.js';

export interface CanvasVideoBusy {
  canvasId: string;
  attemptId: string;
  taskId?: string;
  createdAt: string;
  projectLabel?: string;
  reason?: string;
}

const submissions = new Map<string, string>();

function submissionKey(projectRoot: string, attempt: CanvasGenerationAttempt): string {
  return JSON.stringify([
    fs.realpathSync(projectRoot),
    attempt.canvasId,
    attempt.targetNodeId
      ? ['target', attempt.targetNodeId]
      : ['sources', ...(attempt.sourceImageIds || [attempt.sourceImageId])],
  ]);
}

export function acquireVideoSubmission(
  projectRoot: string,
  attempt: CanvasGenerationAttempt
): () => void {
  const key = submissionKey(projectRoot, attempt);
  if (submissions.has(key))
    throw new ConsoleError('该视频正在提交，请等待当前提交完成或停止本地等待。', 409);
  submissions.set(key, attempt.id);
  return () => {
    if (submissions.get(key) === attempt.id) submissions.delete(key);
  };
}

export function releaseVideoSubmission(
  projectRoot: string,
  attempt: CanvasGenerationAttempt
): void {
  const key = submissionKey(projectRoot, attempt);
  if (submissions.get(key) === attempt.id) submissions.delete(key);
}

export function unfinishedVideo(attempt: CanvasGenerationAttempt): boolean {
  return (
    attempt.kind === 'video' &&
    (attempt.executionState === 'unknown' ||
      !(
        (attempt.status === 'succeeded' && !!attempt.resultAssetPath) ||
        attempt.remoteStatus === 'failed' ||
        (attempt.executionState === 'not_executed' && !attempt.taskId)
      ))
  );
}
