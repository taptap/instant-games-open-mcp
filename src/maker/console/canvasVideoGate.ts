import fs from 'node:fs';
import path from 'node:path';
import { getMakerHome } from '../storage.js';
import { ConsoleError } from './types.js';
import type { CanvasGenerationAttempt } from './canvasGeneration.js';
import { videoTaskTiming } from '../canvas/videoTaskTiming.js';

export interface CanvasVideoBusy {
  canvasId: string;
  attemptId: string;
  taskId?: string;
  createdAt: string;
  projectLabel?: string;
  reason?: string;
}

type Reservation = CanvasVideoBusy & { projectRoot: string };

export function occupiesVideoSlot(attempt: CanvasGenerationAttempt): boolean {
  return unfinishedVideo(attempt) && !videoTaskTiming(attempt).waitExpired;
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

export function videoBusy(projectRoot: string, attempt: CanvasGenerationAttempt): CanvasVideoBusy {
  return {
    canvasId: attempt.canvasId,
    attemptId: attempt.id,
    taskId: attempt.taskId,
    createdAt: attempt.createdAt,
    projectLabel: path.basename(projectRoot),
    reason: attempt.taskId
      ? '已有未完成视频，提交满 10 分钟后可生成新视频；原 taskId 可在提交后 6 小时内查询。'
      : '未取得 taskId，无法查询；提交满 10 分钟后解除本地占用，不代表远端已取消。',
  };
}

function filename(): string {
  return path.join(getMakerHome(), 'console', 'canvas-video.json');
}

export function reservedVideo(): CanvasVideoBusy | undefined {
  if (!fs.existsSync(filename())) return undefined;
  const reservation = JSON.parse(fs.readFileSync(filename(), 'utf8')) as Reservation;
  if (!path.isAbsolute(reservation.projectRoot) || !/^[0-9a-f-]{36}$/i.test(reservation.attemptId))
    throw new ConsoleError('视频占用记录无效，需要人工核实；不能重复提交。', 409);
  if (videoTaskTiming(reservation).waitExpired) return undefined;
  const attemptFile = path.join(
    reservation.projectRoot,
    '.maker',
    'canvases',
    'attempts',
    reservation.attemptId + '.json'
  );
  try {
    if (fs.lstatSync(attemptFile).isSymbolicLink()) throw new Error('Invalid attempt');
    const attempt = JSON.parse(fs.readFileSync(attemptFile, 'utf8')) as CanvasGenerationAttempt;
    if (
      attempt.id !== reservation.attemptId ||
      attempt.canvasId !== reservation.canvasId ||
      attempt.kind !== 'video' ||
      !['running', 'pending', 'succeeded', 'failed', 'unknown', 'canceled'].includes(attempt.status)
    )
      throw new Error('Invalid attempt');
    return occupiesVideoSlot(attempt) ? videoBusy(reservation.projectRoot, attempt) : undefined;
  } catch {
    const { projectRoot: _projectRoot, ...busy } = reservation;
    return {
      ...busy,
      reason: '原视频记录暂不可读取；提交满 10 分钟后解除本地占用，时间记录无效时需人工核实。',
    };
  }
}

export function reserveVideo(
  projectRoot: string,
  attempt: CanvasGenerationAttempt,
  save: () => void
): void {
  fs.mkdirSync(path.dirname(filename()), { recursive: true, mode: 0o700 });
  const lock = filename() + '.lock';
  try {
    fs.mkdirSync(lock, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    throw new ConsoleError('视频提交正在登记，或遗留登记需要人工核实；不能重复提交。', 409);
  }
  try {
    if (reservedVideo())
      throw new ConsoleError(
        '已有未完成视频，请等待原任务；提交满 10 分钟后解除本地占用，不代表远端已取消。',
        409
      );
    const reservation: Reservation = { projectRoot, ...videoBusy(projectRoot, attempt) };
    const temporary = filename() + '.' + attempt.id + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(reservation), { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, filename());
    save();
  } finally {
    fs.rmdirSync(lock);
  }
}
