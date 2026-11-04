/**
 * Pull the Maker remote main into the local project without committing local
 * changes: fetch, then fast-forward or merge. Merge conflicts are aborted.
 *
 * Used by `taptap-maker git sync`. The console keeps its own pull flow.
 */

import { sanitizeDiagnosticValue } from '../server/diagnosticRedaction.js';
import { GitCommandError } from './exec.js';
import { createGitRunner, gitOperationInProgress, mergeRemote } from './merge.js';
import { withShallowAcknowledgmentsRecovery } from './run.js';
import { parseStatusZ } from './status.js';

export interface MakerGitSyncResult {
  outcome: 'updated' | 'up_to_date' | 'ahead' | 'blocked' | 'conflict' | 'unavailable';
  message: string;
  detail?: string;
  aheadCount: number;
  behindCount: number;
  localChangeCount: number;
  /** Files changed on both sides, or local files git refused to overwrite. */
  conflictFiles: string[];
}

const INSPECT_TIMEOUT_MS = 15000;
const FETCH_TIMEOUT_MS = 60000;
const MAX_DETAIL_LENGTH = 2000;
const REMOTE_REF = 'origin/main';

export async function syncMakerProject(cwd: string): Promise<MakerGitSyncResult> {
  const run = createGitRunner(cwd);
  const base = { aheadCount: 0, behindCount: 0, localChangeCount: 0, conflictFiles: [] };

  const branch = (await run(['branch', '--show-current'], INSPECT_TIMEOUT_MS)).trim();
  if (branch !== 'main') {
    return { ...base, outcome: 'blocked', message: '当前不在 main，Maker 只使用 main。' };
  }
  if (await gitOperationInProgress(cwd, run)) {
    return {
      ...base,
      outcome: 'blocked',
      message:
        '已有未完成的 Git 操作（merge、rebase、cherry-pick 或 index.lock）。请先完成或取消该操作。',
    };
  }

  try {
    await withShallowAcknowledgmentsRecovery(cwd, () => run(['fetch', 'origin'], FETCH_TIMEOUT_MS));
  } catch (error) {
    return {
      ...base,
      outcome: 'unavailable',
      message: '暂时无法确认远端。请检查登录或网络后再试。',
      detail: gitDetail(error),
    };
  }

  try {
    await run(['rev-parse', '--verify', '--quiet', REMOTE_REF], INSPECT_TIMEOUT_MS);
  } catch {
    return {
      ...base,
      outcome: 'blocked',
      message: '未找到远端 main。请确认这是完整的 Maker 项目。',
    };
  }
  const [ahead, behind] = (
    await run(['rev-list', '--left-right', '--count', `HEAD...${REMOTE_REF}`], INSPECT_TIMEOUT_MS)
  )
    .trim()
    .split(/\s+/);
  const aheadCount = Number.parseInt(ahead || '0', 10) || 0;
  const behindCount = Number.parseInt(behind || '0', 10) || 0;
  const localChangeCount = parseStatusZ(
    await run(['status', '--porcelain=v1', '-z', '--untracked-files=normal'], INSPECT_TIMEOUT_MS)
  ).length;
  const state = { ...base, aheadCount, behindCount, localChangeCount };

  if (behindCount === 0) {
    return aheadCount === 0
      ? { ...state, outcome: 'up_to_date', message: '本地代码已经和远端一致。' }
      : {
          ...state,
          outcome: 'ahead',
          message: `本地有 ${aheadCount} 个未推送提交，远端没有新提交。`,
        };
  }

  const result = await mergeRemote(cwd, REMOTE_REF, run);
  if (result.outcome === 'merged') {
    const kept = localChangeCount > 0 ? '，本地未提交修改仍保留' : '';
    return {
      ...state,
      outcome: 'updated',
      message:
        aheadCount > 0
          ? `已合并 ${behindCount} 个远端提交${kept}。本地生成了合并提交，推送时一并提交。`
          : `已拉取 ${behindCount} 个远端提交${kept}。`,
    };
  }
  if (result.outcome === 'conflict' || result.overwrittenFiles.length > 0) {
    return {
      ...state,
      outcome: 'conflict',
      message: '这些文件两边都改过，已取消合并，本地文件保持原样。',
      conflictFiles: result.conflictFiles.length ? result.conflictFiles : result.overwrittenFiles,
      detail: gitDetail(result.error),
    };
  }
  return {
    ...state,
    outcome: 'blocked',
    message: result.conflictFiles.length
      ? '合并冲突后未能自动取消合并。请检查当前 Git 状态，不要再次同步。'
      : '这次不能安全合并远端代码，本地文件保持原样。请查看 detail 后处理。',
    conflictFiles: result.conflictFiles,
    detail: gitDetail(result.error),
  };
}

function gitDetail(error: unknown): string {
  const text =
    error instanceof GitCommandError
      ? error.stderr || error.message
      : error instanceof Error
        ? error.message
        : '';
  return String(sanitizeDiagnosticValue(text)).slice(0, MAX_DETAIL_LENGTH);
}
