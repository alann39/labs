/**
 * Gate-waiting notification decision (run dogfood-001).
 *
 * The banner is the always-visible part of the notification; the
 * notification *sound* fires EXACTLY ONCE per null → active transition
 * of gateWaiting. Poll / WS / seed can re-set the same gate repeatedly —
 * the sound must not replay for those.
 */

export type GateWaiting = { gate: string; docVersion?: string } | null

/** Notification key for a gateWaiting value: the gate id, or null when idle. */
export function gateNotifyKey(gw: GateWaiting): string | null {
  return gw ? gw.gate : null
}

/**
 * True when the notification sound should fire: the key moved from a
 * previous value to a new active gate (null → active, or active → a
 * different gate). Re-setting the same gate (re-render / next poll with
 * identical state) returns false. Active → null returns false.
 */
export function shouldPlayGateNotification(prevKey: string | null, next: GateWaiting): boolean {
  const key = gateNotifyKey(next)
  return key !== null && key !== prevKey
}
