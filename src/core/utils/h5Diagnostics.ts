import type { AppCacheInfo, CachedLevelInfo } from './cache.js';
import { isAuthError } from '../errors/authErrors.js';

/** Redact upstream error strings before including them in shareable H5 reports. */
export function safeH5Error(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL redacted]')
    .replace(/\b(?:Bearer|MAC)\s+[^\r\n]+/gi, '[authorization redacted]')
    .replace(
      /(["']?(?:authorization|[\w-]*token|[\w-]*secret|mac_key|api[_-]?key|x-tap-sign|signature)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,
      '$1[redacted]'
    )
    .slice(0, 1200);
}

function scalar(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return safeH5Error(value).slice(0, 100);
  return null;
}

function snapshot(level: CachedLevelInfo | undefined, draft: boolean) {
  if (!level) return null;
  const info = draft ? level.form_data?.info : level.data;
  return {
    id: scalar(level.id),
    version: scalar(level.version),
    status: scalar(level.status),
    package_id: scalar(info?.package_id),
    screen_orientation: scalar(info?.screen_orientation),
    screen_orientation_type: typeof info?.screen_orientation,
  };
}

/** Only allowlisted metadata is included; never serialize a raw API response. */
export function formatH5OrientationDiagnostics(input: {
  code: string;
  appId?: number;
  developerId?: number;
  expectedOrientation?: number;
  packageId?: number;
  cache?: AppCacheInfo;
  phase: string;
  endpoint: string;
  source?: 'cache' | 'server' | 'unavailable';
  requestId?: string;
  adStatus?: unknown;
  adSpaces?: unknown;
  error?: unknown;
}): string {
  const { cache } = input;
  const authError = isAuthError(input.error) ? input.error : undefined;
  const responseDetails = authError?.responseDetails;
  const report = {
    diagnostic_revision: 'h5-ads-2',
    code: input.code,
    time: new Date().toISOString(),
    phase: input.phase,
    endpoint: input.endpoint,
    source: input.source ?? 'unavailable',
    request_id: input.requestId,
    request_id_source: input.requestId ? 'mcp_local' : undefined,
    app_id: input.appId ?? cache?.app_id,
    developer_id: input.developerId ?? cache?.developer_id,
    expected_screen_orientation: input.expectedOrientation,
    submitted_package_id: input.packageId,
    upload_level: snapshot(cache?.upload_level, true),
    level: snapshot(cache?.level, false),
    ad_status: scalar(input.adStatus),
    ad_spaces: Array.isArray(input.adSpaces)
      ? input.adSpaces.slice(0, 20).map((space) => ({
          type: scalar(space?.type),
          id_present: typeof space?.id === 'string' && space.id.trim().length > 0,
        }))
      : null,
    error: input.error === undefined ? undefined : safeH5Error(input.error),
    auth_error: authError
      ? {
          code: authError.code,
          http_status: responseDetails?.httpStatus ?? null,
          upstream_code: scalar(responseDetails?.upstreamCode),
          upstream_message: responseDetails?.upstreamMessage
            ? safeH5Error(responseDetails.upstreamMessage)
            : null,
          server_request_id: scalar(responseDetails?.serverRequestId),
        }
      : undefined,
  };
  return (
    '\n\n诊断信息（请随问题反馈，null 表示本阶段未采集到或字段未返回）：\n```json\n' +
    JSON.stringify(report, null, 2) +
    '\n```'
  );
}
