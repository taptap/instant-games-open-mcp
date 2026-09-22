/**
 * Achievement remote-proxy result normalization and local input guards.
 *
 * Limits itself to the `achievement` tool. It does not change shared Proxy
 * defaults, download remote workspace lock files, or retry unknown writes.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const ACHIEVEMENT_PROXY_TOOL_NAME = 'achievement';

export const ACHIEVEMENT_PARTIAL_SUCCESS_GUIDANCE =
  'Platform operation succeeded, but the remote workspace lock was not synced. ' +
  'Recover by calling achievement with op="sync_achievements" only; ' +
  'do not replay the original write. lock_sync.path is a remote workspace relative ' +
  'path and must not be used to read, write, or download local files.';

export const ACHIEVEMENT_BUSINESS_FAILURE_NEXT_ACTION =
  'This is an achievement business failure, not an MCP connectivity defect. ' +
  'Show the returned error to the user, follow any developer-center URL, and wait. ' +
  'Do not continue definition changes, do not loop builds, and do not file an MCP issue report.';

const REJECTED_IDENTITY_OVERRIDE_PARAMS = [
  'app_id',
  'developer_id',
  'client_id',
  'managementId',
  'management_id',
] as const;

const GENERATED_ASSET_REGISTRY_PATH = ['.maker', 'assets', 'generated-assets.json'] as const;

type JsonRecord = Record<string, unknown>;

/**
 * Normalize one upstream achievement CallToolResult before Maker returns it.
 */
export function normalizeAchievementProxyResult(
  result: CallToolResult,
  expectedOp: string
): CallToolResult {
  if (result.isError === true) {
    return result;
  }

  const extraction = extractAchievementBusinessPayload(result, expectedOp);
  if (extraction.kind === 'protocol_error') {
    return attachProtocolError(result, extraction.message);
  }
  if (extraction.kind === 'none') {
    return result;
  }

  const payload = extraction.payload;
  if (payload.success === false) {
    return attachBusinessFailureGuidance(result, payload);
  }

  if (isPartialLockSyncSuccess(payload)) {
    return attachPartialSuccessGuidance(result, payload);
  }

  return result;
}

/**
 * Reject identity overrides and non-HTTP(S) achievement icons before forwarding.
 */
export function prepareAchievementProxyToolArgs(options: {
  targetDir: string;
  args: Record<string, unknown>;
}): Record<string, unknown> {
  const rejected = REJECTED_IDENTITY_OVERRIDE_PARAMS.filter((name) => name in options.args);
  if (rejected.length > 0) {
    throw new Error(
      'achievement does not accept identity override parameters ' +
        `(${rejected.join(', ')}). App, developer, and client identity come from the ` +
        'bound remote Maker project and server environment. Do not pass app_id, ' +
        'developer_id, client_id, or managementId.'
    );
  }

  const nextArgs = { ...options.args };
  if (nextArgs.image_url !== undefined) {
    nextArgs.image_url = resolveAchievementImageUrl(options.targetDir, nextArgs.image_url);
  }
  return nextArgs;
}

function extractAchievementBusinessPayload(
  result: CallToolResult,
  expectedOp: string
):
  | { kind: 'none' }
  | { kind: 'payload'; payload: JsonRecord }
  | { kind: 'protocol_error'; message: string } {
  const payloads: JsonRecord[] = [];

  const structured = (result as CallToolResult & { structuredContent?: unknown }).structuredContent;
  if (isBusinessCandidate(structured)) {
    const validated = validateBusinessPayload(structured, expectedOp, 'structuredContent');
    if (validated.kind === 'protocol_error') {
      return validated;
    }
    payloads.push(validated.payload);
  }

  const content = Array.isArray(result.content) ? result.content : [];
  for (const item of content) {
    if (!isTextContent(item)) {
      continue;
    }
    const parsed = parsePossibleJsonObject(item.text);
    if (parsed.kind === 'invalid_json') {
      return {
        kind: 'protocol_error',
        message: 'achievement text content contained damaged JSON.',
      };
    }
    if (parsed.kind === 'none') {
      continue;
    }
    if (!isBusinessCandidate(parsed.value)) {
      continue;
    }
    const validated = validateBusinessPayload(parsed.value, expectedOp, 'text');
    if (validated.kind === 'protocol_error') {
      return validated;
    }
    payloads.push(validated.payload);
  }

  if (payloads.length === 0) {
    return { kind: 'none' };
  }

  const canonical = payloads[0];
  for (const payload of payloads.slice(1)) {
    if (!deepEqualJson(canonical, payload)) {
      return {
        kind: 'protocol_error',
        message: 'achievement returned conflicting business payloads.',
      };
    }
  }

  return { kind: 'payload', payload: canonical };
}

function validateBusinessPayload(
  value: JsonRecord,
  expectedOp: string,
  source: string
): { kind: 'payload'; payload: JsonRecord } | { kind: 'protocol_error'; message: string } {
  if (typeof value.success !== 'boolean') {
    return {
      kind: 'protocol_error',
      message: `achievement ${source} is missing a boolean success field.`,
    };
  }
  if (typeof value.op !== 'string' || value.op.length === 0) {
    return {
      kind: 'protocol_error',
      message: `achievement ${source} is missing op.`,
    };
  }
  if (expectedOp && value.op !== expectedOp) {
    return {
      kind: 'protocol_error',
      message: `achievement op mismatch: expected ${expectedOp}, received ${value.op}.`,
    };
  }
  return { kind: 'payload', payload: value };
}

function attachProtocolError(result: CallToolResult, message: string): CallToolResult {
  const existingStructured = isRecord(
    (result as CallToolResult & { structuredContent?: unknown }).structuredContent
  )
    ? {
        ...(result as CallToolResult & { structuredContent: JsonRecord }).structuredContent,
      }
    : {};
  return {
    ...result,
    isError: true,
    content: Array.isArray(result.content) ? result.content : [],
    structuredContent: addLocalFields(existingStructured, {
      automatic_retry: false,
      local_protocol_error: message,
    }),
  } as CallToolResult;
}

function attachBusinessFailureGuidance(
  result: CallToolResult,
  payload: JsonRecord
): CallToolResult {
  const content = Array.isArray(result.content) ? [...result.content] : [];
  const alreadyPresent = content.some(
    (item) => isTextContent(item) && item.text.includes(ACHIEVEMENT_BUSINESS_FAILURE_NEXT_ACTION)
  );
  if (!alreadyPresent) {
    content.push({
      type: 'text',
      text: ACHIEVEMENT_BUSINESS_FAILURE_NEXT_ACTION,
    });
  }
  const existingStructured = isRecord(
    (result as CallToolResult & { structuredContent?: unknown }).structuredContent
  )
    ? {
        ...(result as CallToolResult & { structuredContent: JsonRecord }).structuredContent,
      }
    : { ...payload };
  return {
    ...result,
    isError: true,
    content,
    structuredContent: addLocalFields(existingStructured, {
      local_business_failure_guidance: ACHIEVEMENT_BUSINESS_FAILURE_NEXT_ACTION,
    }),
  } as CallToolResult;
}

function attachPartialSuccessGuidance(result: CallToolResult, payload: JsonRecord): CallToolResult {
  const content = Array.isArray(result.content) ? [...result.content] : [];
  content.push({
    type: 'text',
    text: ACHIEVEMENT_PARTIAL_SUCCESS_GUIDANCE,
  });
  const existingStructured = isRecord(
    (result as CallToolResult & { structuredContent?: unknown }).structuredContent
  )
    ? {
        ...(result as CallToolResult & { structuredContent: JsonRecord }).structuredContent,
      }
    : { ...payload };
  return {
    ...result,
    content,
    structuredContent: addLocalFields(existingStructured, {
      local_lock_sync_guidance: ACHIEVEMENT_PARTIAL_SUCCESS_GUIDANCE,
    }),
  } as CallToolResult;
}

function isPartialLockSyncSuccess(payload: JsonRecord): boolean {
  if (payload.success !== true || payload.remote_applied !== true) {
    return false;
  }
  const lockSync = payload.lock_sync;
  return isRecord(lockSync) && lockSync.synced === false;
}

function resolveAchievementImageUrl(targetDir: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('image_url 需为有效的 HTTP(S) 图片 URL');
  }
  const imageUrl = value.trim();
  if (/^https?:\/\//iu.test(imageUrl)) {
    return imageUrl;
  }
  if (imageUrl.startsWith('data:') || /^file:/iu.test(imageUrl)) {
    throw new Error(
      'achievement image_url only accepts HTTP(S) URLs. Local paths and data URLs are not uploaded.'
    );
  }

  const mapped = lookupGeneratedAssetCdnUrl(targetDir, imageUrl);
  if (mapped) {
    return mapped;
  }

  throw new Error(
    'achievement image_url only accepts HTTP(S) URLs. This local path has no trusted remote mapping; ' +
      'reuse a previously generated Maker asset URL or an existing verified upload flow. ' +
      'This version does not upload local achievement icons.'
  );
}

function lookupGeneratedAssetCdnUrl(targetDir: string, value: string): string | undefined {
  const registryPath = path.join(targetDir, ...GENERATED_ASSET_REGISTRY_PATH);
  if (!fs.existsSync(registryPath)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as unknown;
    if (!isRecord(parsed)) {
      return undefined;
    }
    const candidates = new Set<string>([value, normalizeGeneratedAssetKey(value)]);
    for (const key of candidates) {
      const mapped = readCdnUrl(parsed[key]);
      if (mapped) {
        return mapped;
      }
    }
    const normalizedValue = normalizeGeneratedAssetKey(value);
    for (const record of Object.values(parsed)) {
      if (!isRecord(record) || typeof record.localPath !== 'string') {
        continue;
      }
      if (normalizeGeneratedAssetKey(record.localPath) !== normalizedValue) {
        continue;
      }
      const mapped = readCdnUrl(record);
      if (mapped) {
        return mapped;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function normalizeGeneratedAssetKey(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//u, '');
}

function readCdnUrl(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const cdnUrl = value.cdnUrl;
  const previewUrl = value.previewUrl;
  if (typeof cdnUrl === 'string' && /^https?:\/\//iu.test(cdnUrl)) {
    return cdnUrl;
  }
  if (typeof previewUrl === 'string' && /^https?:\/\//iu.test(previewUrl)) {
    return previewUrl;
  }
  return undefined;
}

function parsePossibleJsonObject(
  text: string
): { kind: 'none' } | { kind: 'value'; value: JsonRecord } | { kind: 'invalid_json' } {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{')) {
    return { kind: 'none' };
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isRecord(parsed) ? { kind: 'value', value: parsed } : { kind: 'invalid_json' };
  } catch {
    return { kind: 'invalid_json' };
  }
}

function isBusinessCandidate(value: unknown): value is JsonRecord {
  return isRecord(value) && ('success' in value || 'op' in value);
}

function addLocalFields(target: JsonRecord, localFields: JsonRecord): JsonRecord {
  const next = { ...target };
  for (const [key, value] of Object.entries(localFields)) {
    if (!(key in next)) {
      next[key] = value;
    }
  }
  return next;
}

function deepEqualJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isTextContent(item: unknown): item is { type: 'text'; text: string } {
  return (
    typeof item === 'object' &&
    item !== null &&
    (item as { type?: unknown }).type === 'text' &&
    typeof (item as { text?: unknown }).text === 'string'
  );
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
