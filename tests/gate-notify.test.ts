/**
 * run dogfood-001 — gate-waiting notification (banner + one sound per
 * null → active transition).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { gateNotifyKey, shouldPlayGateNotification } from '../src/gateNotify'

describe('gateNotify decision', () => {
  it('gateNotifyKey returns the gate id, null when idle', () => {
    expect(gateNotifyKey(null)).toBeNull()
    expect(gateNotifyKey({ gate: '0.5' })).toBe('0.5')
    expect(gateNotifyKey({ gate: '1.6', docVersion: 'mockup v2' })).toBe('1.6')
  })

  it('AC1: null → active fires exactly once; same gate re-set does not', () => {
    expect(shouldPlayGateNotification(null, { gate: '0.5' })).toBe(true)
    expect(shouldPlayGateNotification('0.5', { gate: '0.5' })).toBe(false)
  })

  it('active → null never fires', () => {
    expect(shouldPlayGateNotification('0.5', null)).toBe(false)
    expect(shouldPlayGateNotification(null, null)).toBe(false)
  })

  it('E2: active A → active B (new transition) fires again', () => {
    expect(shouldPlayGateNotification('0.5', { gate: '1.6' })).toBe(true)
  })

  it('full transition sequence, mimicking the App.tsx ref logic', () => {
    // Simulates: notifiedGateKeyRef starts null; on each gateWaiting
    // value, decide, then store the key when fired.
    let prev: string | null = null
    const step = (gw: { gate: string } | null): boolean => {
      const fire = shouldPlayGateNotification(prev, gw)
      if (fire) prev = gateNotifyKey(gw)
      if (gw === null) prev = null
      return fire
    }
    expect(step(null)).toBe(false) // idle
    expect(step({ gate: '0.5' })).toBe(true) // E1: waiting on load → once
    expect(step({ gate: '0.5' })).toBe(false) // re-render / next poll → silent
    expect(step({ gate: '0.5' })).toBe(false)
    expect(step(null)).toBe(false) // Gas → dismiss
    expect(step({ gate: '1.6' })).toBe(true) // E2: next gate → sound again
    expect(step({ gate: '1.6' })).toBe(false)
  })
})

describe('playNotification safety (AC3/E3/E4)', () => {
  function makeOsc() {
    return {
      type: 'sine',
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }
  }
  class FakeAudioContext {
    static instances: FakeAudioContext[] = []
    oscillators: ReturnType<typeof makeOsc>[] = []
    currentTime = 0
    destination = {}
    constructor() { FakeAudioContext.instances.push(this) }
    createOscillator() { const o = makeOsc(); this.oscillators.push(o); return o }
    createGain() {
      return {
        gain: {
          value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(),
          setTargetAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      }
    }
  }
  class FakeSuspendedContext extends FakeAudioContext {
    state = 'suspended'
    resume = vi.fn(async () => { this.state = 'running' })
  }

  beforeEach(() => {
    vi.useFakeTimers()
    FakeAudioContext.instances = []
    ;(globalThis as any).AudioContext = FakeSuspendedContext
    vi.resetModules()
  })
  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as any).AudioContext
  })

  it('AC3/E3: playNotification on locked (suspended) audio does not throw', async () => {
    const sfx = await import('../src/sounds')
    expect(() => sfx.playNotification()).not.toThrow()
    vi.runAllTimers() // flush the setTimeout second beep
    expect(() => sfx.playNotification()).not.toThrow()
  })

  it('E4: muted → playNotification is a silent no-op (no oscillators)', async () => {
    const sfx = await import('../src/sounds')
    sfx.setVolume(0)
    sfx.playNotification()
    vi.runAllTimers()
    expect(FakeAudioContext.instances).toHaveLength(0)
    sfx.setVolume(0.5)
  })
})
