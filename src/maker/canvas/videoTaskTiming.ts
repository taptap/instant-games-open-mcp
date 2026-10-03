export function videoTaskTiming(attempt: { createdAt: string }, now = Date.now()) {
  const created = Date.parse(attempt.createdAt);
  const valid = Number.isFinite(created);
  const queryUntil = valid ? created + 6 * 60 * 60_000 : undefined;
  return {
    queryUntil,
    queryExpired: queryUntil === undefined || now >= queryUntil,
  };
}
