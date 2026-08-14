/**
 * Redact credentials while preserving Maker diagnostic structure.
 */

export function isSensitiveDiagnosticKey(key: string): boolean {
  const normalized = key.replace(/[-\s]/gu, '_').toLowerCase();
  return (
    /(?:^|_)(?:authorization|cookie|password|passwd|passphrase|pat|token|secret)$/u.test(
      normalized
    ) ||
    /(?:^|_)(?:access|refresh|id|api|auth|bearer|personal_access)?_?token$/u.test(normalized) ||
    /(?:^|_)(?:client|app|api|mac)?_?secret$/u.test(normalized) ||
    /(?:^|_)(?:api|auth|mac|private)?_?key$/u.test(normalized) ||
    /(?:^|_)pat$/u.test(normalized)
  );
}

export function sanitizeDiagnosticValue(value: unknown): unknown {
  return sanitizeValue(value, true, new WeakSet<object>());
}

export function sanitizeRemoteDiagnosticValue(value: unknown): unknown {
  return sanitizeValue(value, true, new WeakSet<object>());
}

function sanitizeValue(value: unknown, sanitizeText: boolean, visited: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return sanitizeText ? sanitizeDiagnosticText(value) : value;
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (visited.has(value)) {
    return '<circular>';
  }
  visited.add(value);

  if (Array.isArray(value)) {
    const result = value.map((item) => sanitizeValue(item, sanitizeText, visited));
    visited.delete(value);
    return result;
  }

  const result: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    result[key] = isSensitiveDiagnosticKey(key)
      ? '<redacted>'
      : sanitizeValue(nestedValue, sanitizeText, visited);
  }
  visited.delete(value);
  return result;
}

function sanitizeDiagnosticText(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object') {
      return JSON.stringify(sanitizeRemoteDiagnosticValue(parsed), null, 2);
    }
  } catch {
    // Preserve non-JSON remote error text after applying common credential patterns below.
  }

  return value
    .replace(/\b(authorization|cookie)\b\s*:\s*[^\r\n]*/giu, '$1: <redacted>')
    .replace(
      /(^|[\s,;])(--(?:[a-z0-9]+[-_])*(?:pat|token|secret|authorization|cookie|password|passwd|passphrase|mac[-_]?key|api[-_]?key|auth[-_]?key|private[-_]?key))\s+(?:"[^"]*"|'[^']*'|[^\s,;]+)/gimu,
      '$1$2 <redacted>'
    )
    .replace(
      /\b((?:[A-Za-z][A-Za-z0-9_-]*[_-])?(?:authorization|cookie|password|passwd|passphrase|pat|token|secret|(?:api|auth|mac|private)[_-]?key))\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;&]+)/giu,
      '$1=<redacted>'
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}(?=$|[\s,;'"()\x5B\x5D{}])/giu, 'Bearer <redacted>')
    .replace(/\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){2}\b/gu, '<redacted>');
}
