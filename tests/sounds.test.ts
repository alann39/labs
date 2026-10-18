/**
 * src/sounds.ts — the ambient hum's stop/restart race (audit C46): stopAmbient's
 * deferred cleanup must only ever stop the oscillator it was called for.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function makeOsc() {
  return {
    type: 'sine',
    frequency: { value: 0, exponentialRampToValueAtTime: vi.fn() },
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
  createGain() { return { gain: { value: 0, exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn() } }
}

describe('sounds.ts unlock (no-sound-at-all bug)', () => {
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

  it('playAmbientHum on a suspended context does NOT mark the hum running, so unlock retries it', async () => {
    const sfx = await import('../src/sounds')
    expect(sfx.getAudioState()).toBe('suspended')
    sfx.playAmbientHum() // suspended: no oscillator, flag stays clear
    const ctx = FakeAudioContext.instances[0] as unknown as FakeSuspendedContext
    expect(ctx.oscillators).toHaveLength(0)

    const ok = await sfx.resumeAudio()
    expect(ok).toBe(true)
    expect(sfx.getAudioState()).toBe('running')
    sfx.playAmbientHum() // now it really starts
    expect(ctx.oscillators).toHaveLength(1)
  })

  it('resumeAudio reports false while muted', async () => {
    const sfx = await import('../src/sounds')
    sfx.setVolume(0)
    expect(await sfx.resumeAudio()).toBe(false)
    expect(sfx.getAudioState()).toBe('muted')
  })

  it('playTestBell rings a clearly audible bell (peak >= 0.2) on a running context', async () => {
    // Running-context fake: resume is a no-op, state already 'running'.
    class FakeRunningContext extends FakeAudioContext {
      state = 'running'
      resume = vi.fn(async () => { /* already running */ })
    }
    ;(globalThis as any).AudioContext = FakeRunningContext
    vi.resetModules()
    const sfx = await import('../src/sounds')
    await sfx.resumeAudio() // creates the FakeRunningContext instance
    // Capture the gain nodes beep() creates: the fake hands out a fresh
    // object per createGain, so intercept it on the single instance.
    const ctx = FakeAudioContext.instances[0] as unknown as FakeRunningContext
    const gains: any[] = []
    const origCreateGain = (ctx as any).createGain.bind(ctx)
    ;(ctx as any).createGain = () => { const g = origCreateGain(); gains.push(g); return g }
    const ok = await sfx.playTestBell()
    expect(ok).toBe(true)
    expect(gains.length).toBeGreaterThanOrEqual(1)
    const peak = gains[0].gain.linearRampToValueAtTime.mock.calls[0][0] as number
    expect(peak).toBeGreaterThanOrEqual(0.2)
  })

  it('resumeAudio reports false when resume leaves the context suspended', async () => {
    // Swap in a fake whose resume() is a no-op (stays suspended).
    class FakeStuckContext extends FakeAudioContext {
      state = 'suspended'
      resume = vi.fn(async () => { /* stays suspended */ })
    }
    ;(globalThis as any).AudioContext = FakeStuckContext
    vi.resetModules()
    const sfx = await import('../src/sounds')
    expect(await sfx.resumeAudio()).toBe(false)
    expect(sfx.getAudioState()).toBe('suspended')
  })
})

describe('sounds.ts ambient hum (C46)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeAudioContext.instances = []
    ;(globalThis as any).AudioContext = FakeAudioContext
    vi.resetModules()
  })
  afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as any).AudioContext
  })

  it('a hum restarted during the 300 ms fade-out survives it, and can be stopped and started again', async () => {
    const sfx = await import('../src/sounds')
    sfx.playAmbientHum()            // mount
    sfx.stopAmbient()               // StrictMode unmount (or mute)
    sfx.playAmbientHum()            // immediate re-mount (or unmute)
    const ctx = FakeAudioContext.instances[0]
    expect(ctx.oscillators).toHaveLength(2)
    const [osc1, osc2] = ctx.oscillators

    vi.advanceTimersByTime(300)     // the first stop's deferred cleanup fires
    expect(osc1.stop).toHaveBeenCalledTimes(1)
    expect(osc2.stop).not.toHaveBeenCalled()

    sfx.playAmbientHum()            // already running: no third oscillator
    expect(ctx.oscillators).toHaveLength(2)

    sfx.stopAmbient()
    vi.advanceTimersByTime(300)
    expect(osc2.stop).toHaveBeenCalledTimes(1)
    sfx.playAmbientHum()            // not wedged: a fresh hum starts
    expect(ctx.oscillators).toHaveLength(3)
  })
})
