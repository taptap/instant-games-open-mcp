/**
 * Best-effort activity tracking for local Maker MCP usage.
 */

import { getMakerApiBaseUrl } from './config.js';
import { resolveMakerClientModel, type MakerClientModel } from './clientModel/index.js';
import { CLIENT_MODEL_TIMEOUT_MS } from './clientModel/limits.js';
import { bestEffort } from './system/bestEffort.js';

declare const __MAKER_VERSION__: string | undefined;

export const MAKER_MCP_TRACKING_ACTION = 'tapmaker_mcp_call';
export const MAKER_MCP_TRACKING_SOURCE = 'local_mcp';
export const MAKER_MCP_TRACKING_TIMEOUT_MS = 1500;
const MAKER_MCP_VERSION =
  typeof __MAKER_VERSION__ !== 'undefined' && __MAKER_VERSION__.trim()
    ? __MAKER_VERSION__.trim()
    : 'dev';
const TRACKING_ERROR_MAX_LENGTH = 500;

export interface MakerMcpTrackingContext {
  userId: string;
  projectId: string;
  clientInfo?: { name: string; version: string };
  projectDir?: string;
  requestModel?: MakerClientModel;
  /** Per-call snapshot shared with status diagnostics, including an unavailable empty result. */
  resolvedModel?: MakerClientModel;
  /** Started at tool entry; reporting awaits the same lookup rather than rereading later. */
  modelSnapshot?: Promise<MakerClientModel>;
}

export interface MakerMcpActivityEvent {
  context: MakerMcpTrackingContext;
  toolName: string;
  requestId?: string | number;
  durationMs?: number;
  success?: boolean;
  errorCode?: string;
  errorMessage?: string;
  userAgent?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface MakerMcpTrackingPayload {
  action: typeof MAKER_MCP_TRACKING_ACTION;
  user_agent?: string;
  args: MakerClientModel & {
    user_id: string;
    project_id: string;
    tool_name: string;
    source: typeof MAKER_MCP_TRACKING_SOURCE;
    mcp_version: string;
    client_name?: string;
    client_version?: string;
    tool_id?: string;
    duration_ms?: number;
    success?: boolean;
    error_code?: string;
    error_message?: string;
  };
}

/**
 * Build a tracking payload without inventing values that are not available.
 */
export function buildMakerMcpTrackingPayload(
  event: MakerMcpActivityEvent
): MakerMcpTrackingPayload | null {
  const userId = event.context.userId.trim();
  const projectId = event.context.projectId.trim();
  const toolName = event.toolName.trim();
  if (!userId || !projectId || !toolName) {
    return null;
  }

  const args: MakerMcpTrackingPayload['args'] = {
    user_id: userId,
    project_id: projectId,
    tool_name: toolName,
    source: MAKER_MCP_TRACKING_SOURCE,
    mcp_version: MAKER_MCP_VERSION,
  };

  if (event.context.clientInfo?.name.trim()) {
    args.client_name = event.context.clientInfo.name.trim();
  }
  if (event.context.clientInfo?.version.trim()) {
    args.client_version = event.context.clientInfo.version.trim();
  }

  if (event.requestId !== undefined && String(event.requestId).trim()) {
    args.tool_id = String(event.requestId);
  }
  if (
    event.durationMs !== undefined &&
    Number.isFinite(event.durationMs) &&
    event.durationMs >= 0
  ) {
    args.duration_ms = Math.round(event.durationMs);
  }
  if (event.success !== undefined) {
    args.success = event.success;
  }
  if (event.errorCode?.trim()) {
    args.error_code = event.errorCode.trim();
  }
  if (event.errorMessage?.trim()) {
    args.error_message = sanitizeMakerMcpTrackingError(event.errorMessage);
  }

  return {
    action: MAKER_MCP_TRACKING_ACTION,
    ...(event.userAgent?.trim() ? { user_agent: event.userAgent.trim() } : {}),
    args,
  };
}

/**
 * Return whether a Maker build result represents a completed remote build.
 */
export function isMakerBuildActivitySuccessful(mode: string): boolean {
  return mode === 'remote_build';
}

/**
 * Remove credential values from error text while preserving paths and identifiers.
 */
export function sanitizeMakerMcpTrackingError(message: string): string {
  return message
    .replace(/Bearer\s+[^,\s"'}<]+/gi, '<redacted>')
    .replace(
      /((?:authorization|access[_-]?token|refresh[_-]?token|mac[_\s-]?key|\bpat\b|token)\s*[:=]\s*)(["']?)[^,\s"'}<]+/gi,
      '$1$2<redacted>'
    )
    .replace(/(https?:\/\/[^:\s/@]+:)[^@\s]+@/gi, '$1<redacted>@')
    .replace(/(https?:\/\/)[^:/\s@]+@/gi, '$1<redacted>@')
    .trim()
    .slice(0, TRACKING_ERROR_MAX_LENGTH);
}

/**
 * Send one local MCP activity event without affecting MCP behavior.
 */
export async function reportMakerMcpActivity(event: MakerMcpActivityEvent): Promise<void> {
  const payload = buildMakerMcpTrackingPayload(event);
  if (!payload) {
    return;
  }

  Object.assign(
    payload.args,
    await bestEffort(
      async () =>
        event.context.resolvedModel ??
        (await event.context.modelSnapshot) ??
        (await resolveMakerClientModel({
          clientName: event.context.clientInfo?.name,
          projectDir: event.context.projectDir,
          requestModel: event.context.requestModel,
        })),
      CLIENT_MODEL_TIMEOUT_MS,
      {}
    )
  );

  const fetchImpl = event.fetchImpl || fetch;
  await bestEffort(
    async (signal) => {
      const response = await fetchImpl(`${getMakerApiBaseUrl()}/tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });
      await response.body?.cancel();
      if (!response.ok) {
        throw new Error(`tracking request failed with HTTP ${response.status}`);
      }
    },
    event.timeoutMs ?? MAKER_MCP_TRACKING_TIMEOUT_MS,
    undefined
  );
}
