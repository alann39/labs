/**
 * Relative time helper for the "· update X dtk lalu" label.
 * Pure function — no side effects, easy to unit-test.
 */

/**
 * Returns seconds since `lastDataAtMs`, clamped to >= 0.
 * If `nowMs < lastDataAtMs`, returns 0 (future timestamp edge case).
 */
export function secondsSince(lastDataAtMs: number, nowMs: number): number {
  const diff = nowMs - lastDataAtMs
  if (diff <= 0) return 0
  return Math.floor(diff / 1000)
}