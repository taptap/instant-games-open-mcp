/**
 * Best-effort activity tracking for local Maker MCP usage.
 */

import { getMakerApiBaseUrl } from './config.js';

export const MAKER_MCP_TRACKING_ACTION = 'tapmaker_mcp_call';
export const MAKER_MCP_TRACKING_SOURCE = 'local_mcp';
export const MAKER_MCP_TRACKING_TIMEOUT_MS = 1500;
const TRACKING_ERROR_MAX_LENGTH = 500;

export interface MakerMcpTrackingContext {
  userId: string;
  projectId: string;
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
  args: {
    user_id: string;
    project_id: string;
    tool_name: string;
    source: typeof MAKER_MCP_TRACKING_SOURCE;
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
  };

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
 * Remove credential values from error text while preserving paths and identifiers.
 */
export function sanitizeMakerMcpTrackingError(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, '<redacted>')
    .replace(
      /((?:authorization|access[_-]?token|refresh[_-]?token|mac[_-]?key|pat|token)\s*[:=]\s*)(["']?)[^,\s"'}<]+/gi,
      '$1$2<redacted>'
    )
    .replace(/(https?:\/\/[^:\s/@]+:)[^@\s]+@/gi, '$1<redacted>@')
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

  const fetchImpl = event.fetchImpl || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    event.timeoutMs ?? MAKER_MCP_TRACKING_TIMEOUT_MS
  );

  try {
    const response = await fetchImpl(`${getMakerApiBaseUrl()}/tracking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`tracking request failed with HTTP ${response.status}`);
    }
  } catch {
    // Tracking is intentionally best-effort. Never surface its failures to MCP users.
  } finally {
    clearTimeout(timeout);
  }
}
