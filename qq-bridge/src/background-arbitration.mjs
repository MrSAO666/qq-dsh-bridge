// An uncertain old reservation remains in its own platform's durable state,
// but cannot indefinitely prevent the other platform from making progress.
// Running or stopping tasks, and recent or malformed reservations, still block.
export const STALE_RESERVATION_MS = 2 * 60 * 60 * 1000;
export function blocksOtherPlatform(active, now = Date.now()) {
  if (!active) return false;
  if (active.status !== 'reserved') return true;
  if (!Number.isFinite(active.reservedAt) || !Number.isFinite(now) || active.reservedAt > now) return true;
  const duration = active.durationMs == null ? 0 : active.durationMs;
  if (!Number.isFinite(duration) || duration < 0) return true;
  return now - active.reservedAt < Math.max(STALE_RESERVATION_MS, duration + 10 * 60 * 1000);
}
