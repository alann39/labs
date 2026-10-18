/**
 * run dogfood-003 — relative time helper for "· update X dtk lalu" label.
 */
import { describe, expect, it } from 'vitest'
import { secondsSince } from '../src/relativeTime'

describe('secondsSince', () => {
  it('returns 0 when now equals lastDataAt', () => {
    const now = 1_000_000
    expect(secondsSince(now, now)).toBe(0)
  })

  it('returns 0 when now is before lastDataAt (future timestamp)', () => {
    expect(secondsSince(1_000_000, 999_999)).toBe(0)
  })

  it('returns 59 at 59 seconds', () => {
    expect(secondsSince(1_000_000, 1_059_000)).toBe(59)
  })

  it('returns 61 at 61 seconds (crosses minute boundary)', () => {
    expect(secondsSince(1_000_000, 1_061_000)).toBe(61)
  })

  it('returns 0 at exactly 1 second', () => {
    expect(secondsSince(1_000_000, 1_001_000)).toBe(1)
  })

  it('handles large differences', () => {
    expect(secondsSince(0, 3_600_000)).toBe(3_600) // 1 hour
  })
})