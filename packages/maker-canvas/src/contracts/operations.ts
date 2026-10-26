import type { CanvasSourceSnapshot } from './document.js';
import type { CanvasImageInfo } from './media.js';
import type { UiAtlasPlan, UiBboxImage, UiBboxElement, UiRecognitionResult } from './ui.js';

export type CanvasGenerationKind = 'image' | 'video';

export type CanvasGenerationStatus =
  | 'running'
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'unknown'
  | 'canceled';

export interface CanvasGenerationAttempt {
  provider?: 'maker' | 'custom' | 'local';
  apiProfileId?: string;
  apiModel?: string;
  uiAtlasPlan?: UiAtlasPlan;
  id: string;
  canvasId: string;
  kind: CanvasGenerationKind;
  toolName: 'generate_image' | 'edit_image' | 'create_video_task' | 'prepare_ui_atlas';
  status: CanvasGenerationStatus;
  prompt: string;
  cutoutColor?: '#FF00FF' | '#00FF00' | 'transparent';
  referenceImages?: Array<CanvasImageInfo & { assetPath: string }>;
  originalImage?: CanvasImageInfo & { assetPath: string; nodeId?: string };
  resultImageInfo?: CanvasImageInfo;
  warnings?: string[];
  submittedPrompt?: string;
  operation?: 'generate' | 'variant' | 'outpaint';
  taskId?: string;
  sourceImagePath?: string;
  sourceImageId?: string;
  sourceImagePaths?: string[];
  sourceImageIds?: string[];
  referenceImagePaths?: string[];
  targetNodeId?: string;
  targetAssetPath?: string;
  remoteStatus?: 'pending' | 'succeeded' | 'failed';
  failureStage?: 'submission' | 'remote' | 'query' | 'download';
  localWaitCanceledAt?: string;
  nextQueryAt?: string;
  sourceSnapshot?: CanvasSourceSnapshot;
  sourceSnapshots?: CanvasSourceSnapshot[];
  parameters?: {
    model?: string;
    resolution?: string;
    targetSize?: string;
    aspectRatio?: string;
    duration?: number;
    ratio?: string;
    userConfirmed?: boolean;
    mode?: 'first_frame' | 'first_last_frame' | 'multi_modal_reference';
  };
  resultAssetPath?: string;
  deliveredAssetPath?: string;
  cachedImage?: boolean;
  remoteAssetUrl?: string;
  credits?: number;
  error?: string;
  executionState?: 'not_executed' | 'unknown';
  createdAt: string;
  updatedAt: string;
}

export type CanvasModelQuality = 'fast' | 'balanced' | 'high_quality';

export interface CanvasModelAttempt {
  id: string;
  canvasId: string;
  nodeId: string;
  sourceId: string;
  sourceVersion: string;
  quality: CanvasModelQuality;
  status: 'running' | 'pending' | 'review' | 'completed' | 'failed' | 'unknown';
  phase: 'views' | 'model';
  assetId?: string;
  taskId?: string;
  stepId?: string;
  reviewId?: string;
  previews: Array<{ view: string; path: string }>;
  modelPath?: string;
  modelDirectory?: string;
  format?: string;
  error?: string;
  retrySafe?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasModelSettings {
  generation: { source: string; profileId?: string };
  profiles: Array<{ id: string; name: string; model: string }>;
}

export interface CanvasImageProvider {
  identity: string;
  source: 'maker' | 'custom' | 'local';
  profileId?: string;
  model?: string;
}

export interface CanvasImageModels {
  provider: CanvasImageProvider;
  tool: 'generate_image' | 'edit_image';
  origin: 'mcp' | 'settings';
  label: string;
  description?: string;
  defaultModel?: string;
  models: Array<{ id: string; label: string; maxReferenceImages?: number }>;
}

export interface CanvasVideoHistory {
  items: CanvasGenerationAttempt[];
  total: number;
  busy?: {
    canvasId: string;
    attemptId: string;
    taskId?: string;
    createdAt: string;
    projectLabel?: string;
    reason?: string;
  };
}

export interface CanvasRecognitionAttempt {
  id: string;
  canvasId: string;
  nodeId: string;
  model: string;
  source?: 'local' | 'server' | 'custom' | 'chatgpt-web';
  sourcePath: string;
  /** Original dimensions supplied by the host for recovery; status and confirmation still apply. */
  recovery?: CanvasImageInfo;
  phase?: 'cut' | 'text';
  cut?: { image: UiBboxImage; elements: UiBboxElement[] };
  status: 'running' | 'succeeded' | 'failed' | 'unknown';
  result?: UiRecognitionResult;
  error?: string;
}

export interface CanvasGroupQueueState {
  groupId: string;
  pending: string[];
  completed: number;
  total: number;
  finished: string[];
  failures: Record<string, string>;
  retries: Record<string, number>;
  active?: string;
  startedAt?: number;
  running: Record<string, number>;
  elapsedMs: number;
  runStartedAt?: number;
  phase: 'queued' | 'running' | 'waiting' | 'paused' | 'complete';
  message: string;
  stopping: boolean;
  /** Structured reason for a deliberate pause; absent for failures and manual stops. */
  pauseReason?: CanvasWorkflowPauseReason;
  /** In-memory execution scope; 'prelayout' stops before paid separation generation. */
  scope?: 'prelayout';
}

export type CanvasWorkflowPauseReason = 'prelayout-review';

/** One local UI delivery assembled from a confirmed resource archive version. */
export interface CanvasUiDelivery {
  id: string;
  archiveRevision: string;
  uiId: string;
  /** Project-relative folder holding images/, reserve/, source/ and ui/ of this version. */
  directory: string;
  uiFile: string;
  referenceFile: string;
  createdAt: string;
  elements?: number;
  steps: {
    assembled: boolean;
    meta: 'pending' | 'done' | 'blocked' | 'failed';
    check: 'pending' | 'passed' | 'failed';
  };
  meta?: { generated: number; preserved: number; skipped: number };
  check?: { nodes: number; errors: number; warnings: number; messages: string[] };
  /** Last failure or blocking reason; full details stay in the delivery record. */
  issue?: string;
  /**
   * What this version accepted without review so the run could finish: element IDs whose cut
   * was not previewed, element IDs left out for lack of any PNG, and unbound categories.
   * Empty lists mean nothing is pending; the review prompt hands the rest to an AI.
   */
  review?: { unreviewed: string[]; missing: string[]; unbound: string[] };
  /**
   * Who drove this version: the canvas button ('canvas'), or the CLI ('cli': a CLI run or
   * assemble-ui, i.e. an AI following the Skill). A CLI version needs no AI hand-off prompt.
   */
  source?: 'canvas' | 'cli';
}

export interface CanvasUiDeliveryStatus {
  /**
   * True when the saved canvas has a resources archive to assemble. Unreviewed or missing
   * assets do not block; they are reported in code/reason and in delivery.review.
   */
  ready: boolean;
  code?: string;
  reason?: string;
  archiveRevision?: string;
  delivery?: CanvasUiDelivery;
  /** Older deliveries of the same bundle; kept, never overwritten. */
  previous?: Array<Pick<CanvasUiDelivery, 'id' | 'archiveRevision' | 'uiFile' | 'createdAt'>>;
  python?: { ready: boolean; message?: string };
}

export interface CanvasCommand {
  requestId: string;
  pageId: string;
  canvasId: string;
  revision?: number;
  action: string;
  input: Record<string, unknown>;
  allowPaid?: boolean;
}

export interface CanvasOperation {
  id: string;
  pageId: string;
  canvasId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown';
  createdAt: number;
  updatedAt: number;
  result?: unknown;
  resultExpired?: boolean;
  error?: string;
}
