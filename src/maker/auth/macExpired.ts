/**
 * Detect remote Maker/TapTap MAC token expiry from proxy tool results.
 *
 * Observed remote shape from get_ad_config / tapRequest:
 * `{ "success": false, "error": "授权已失效" }`
 * when Tap Open API returns `data.error === "access_denied"`.
 */

const MAC_EXPIRED_MESSAGE = '授权已失效';
const ACCESS_DENIED_CODE = 'access_denied';
const PERMISSION_HINT = /permission|rbac|access denied/i;

/**
 * Return whether a remote proxy tool result or thrown error means the local MAC
 * token was rejected and should be refreshed once.
 */
export function isMakerMacExpiredFailure(value: unknown): boolean {
  return inspectMakerMacExpired(value, 0);
}

function inspectMakerMacExpired(value: unknown, depth: number): boolean {
  if (value == null || depth > 6) {
    return false;
  }

  if (typeof value === 'string') {
    return inspectMacExpiredString(value, depth);
  }

  if (value instanceof Error) {
    const error = value as Error & { originalError?: unknown; result?: unknown };
    return (
      inspectMakerMacExpired(error.message, depth + 1) ||
      inspectMakerMacExpired(error.originalError, depth + 1) ||
      inspectMakerMacExpired(error.result, depth + 1) ||
      inspectMakerMacExpired(error.cause, depth + 1)
    );
  }

  if (Array.isArray(value)) {
    return value.some((item) => inspectMakerMacExpired(item, depth + 1));
  }

  if (!isPlainRecord(value)) {
    return false;
  }

  if (isAccessDeniedPayload(value)) {
    return true;
  }

  for (const key of ['error', 'message', 'detail', 'msg']) {
    if (inspectMakerMacExpired(value[key], depth + 1)) {
      return true;
    }
  }

  if (inspectMakerMacExpired(value.data, depth + 1)) {
    return true;
  }

  if (Array.isArray(value.content)) {
    return value.content.some((item) => {
      if (!isPlainRecord(item) || typeof item.text !== 'string') {
        return false;
      }
      return inspectMacExpiredString(item.text, depth + 1);
    });
  }

  return false;
}

function inspectMacExpiredString(text: string, depth: number): boolean {
  if (text.includes(MAC_EXPIRED_MESSAGE)) {
    return true;
  }

  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return false;
  }

  try {
    return inspectMakerMacExpired(JSON.parse(trimmed) as unknown, depth + 1);
  } catch {
    return false;
  }
}

function isAccessDeniedPayload(value: Record<string, unknown>): boolean {
  const errorCode = readErrorCode(value);
  if (errorCode !== ACCESS_DENIED_CODE) {
    return false;
  }

  const nested = isPlainRecord(value.data) ? value.data : undefined;
  const description = [
    value.msg,
    value.message,
    value.error_description,
    nested?.msg,
    nested?.message,
    nested?.error_description,
  ]
    .filter((item): item is string => typeof item === 'string')
    .join(' ');
  return !PERMISSION_HINT.test(description);
}

function readErrorCode(value: Record<string, unknown>): string | undefined {
  if (value.error === ACCESS_DENIED_CODE) {
    return ACCESS_DENIED_CODE;
  }
  const data = value.data;
  if (isPlainRecord(data) && data.error === ACCESS_DENIED_CODE) {
    return ACCESS_DENIED_CODE;
  }
  return undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
