/**
 * Maker Git module. Business code imports Git capabilities from here.
 */

export {
  MakerGitNotFoundError,
  checkGitEnvironment,
  ensureGitAvailable,
  formatGitEnvironmentStatus,
  getGitCommand,
  type MakerGitEnvironment,
} from '../system/git.js';
export { GitCommandError, runGit, runGitSync, type GitExecOptions } from './exec.js';
export { parseStatusZ, statusPaths, type GitStatusEntry } from './status.js';
export {
  MakerGitError,
  getMakerGitRetryDecision,
  isCloudWorkspaceBlockedMessage,
  toMakerGitFailure,
  type MakerGitFailure,
  type MakerGitRetryDecision,
} from './failure.js';
export {
  getMakerGitRetryDelayMs,
  parseGitProgressLine,
  runMakerGitNetworkOperationWithTransientRetry,
  type MakerProjectProgress,
  type MakerProjectProgressHandler,
} from './run.js';
export {
  currentBranch,
  inspectMakerDirectoryGitStatus,
  resolveUsableMakerGitWorkspace,
  type MakerDirectoryGitStatus,
} from './workspace.js';
export { ensureAuthenticatedOrigin, getConfiguredMakerGitBase } from './origin.js';
export {
  getMakerRemoteSyncFailureNextAction,
  inspectMakerRemoteSyncStatus,
  readAheadBehind,
  readMakerProjectLocalChanges,
  type MakerProjectLocalChanges,
  type MakerRemoteSyncStatus,
} from './remoteSync.js';
export {
  createGitRunner,
  gitOperationInProgress,
  gitPathExists,
  mergeRemote,
  parseOverwrittenFiles,
  type GitRunner,
  type MergeRemoteResult,
} from './merge.js';
export {
  CLOUD_REPAIR_COMMIT_MESSAGE,
  pushMakerProject,
  repairCloudWorkspace,
  type MakerCloudRepairResult,
  type PushMakerProjectOptions,
  type PushMakerProjectResult,
} from './push.js';
export {
  cloneMakerProject,
  type CloneMakerProjectOptions,
  type CloneMakerProjectResult,
} from './clone.js';
export { withQrcodeFastForward } from './qrcode.js';
export { syncMakerProject, type MakerGitSyncResult } from './sync.js';
export {
  CloudGitError,
  commitCloudGit,
  getCloudGitDiff,
  getCloudGitStatus,
  resolveCloudAppId,
  type CloudGitCommitInput,
  type CloudGitCommitResult,
  type CloudGitDiff,
  type CloudGitStatus,
} from './cloud.js';
