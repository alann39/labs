// Retro 8-bit sound effects using Web Audio API
let ctx: AudioContext | null = null
let masterVolume = 0.5  // 0–1

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

export type AudioState = 'running' | 'suspended' | 'muted' | 'unavailable'

/**
 * Current audio state for the UI status line. A context whose `state`
 * is missing (older browsers / test fakes) is treated as running —
 * only an explicit 'suspended' counts as suspended.
 */
export function getAudioState(): AudioState {
  if (masterVolume === 0) return 'muted'
  try {
    if (!ctx) return 'suspended'
    if ((ctx as AudioContext).state === 'suspended') return 'suspended'
    return 'running'
  } catch (_) {
    return 'unavailable'
  }
}

/**
 * Unlock audio after a user gesture. Browsers start an AudioContext
 * suspended until a gesture (autoplay policy), so every sound is silent
 * until this runs.
 *
 * ROOT-CAUSE FIX (no-sound-at-all bug): the old version was fire-and-
 * forget (`void c.resume()`) and callers hid the unlock banner without
 * ever checking whether the context actually reached 'running'. Worse,
 * playAmbientHum() set `ambientRunning = true` even on a suspended
 * context, so the mount effect's single 2 s call "used up" the hum and
 * later unlock calls early-returned on the stuck flag. This version
 * awaits the resume, reports whether it really unlocked, and never
 * claims success on a still-suspended context.
 */
export async function resumeAudio(): Promise<boolean> {
  if (masterVolume === 0) return false
  try {
    const c = getCtx()
    if (typeof (c as AudioContext).resume === 'function' && (c as AudioContext).state === 'suspended') {
      await (c as AudioContext).resume()
    }
    return getAudioState() === 'running'
  } catch (_) {
    return false
  }
}

/** True once the AudioContext is running (a user gesture has unlocked it). */
export function isAudioUnlocked(): boolean {
  try {
    return !!ctx && (ctx as AudioContext).state === 'running'
  } catch (_) {
    return false
  }
}

function beep(freq: number, duration: number, type: OscillatorType = 'square', vol = 0.08) {
  if (masterVolume === 0) return
  const c = getCtx()
  // A gesture-initiated beep is a chance to unlock: if the context is
  // still suspended, resume it so this and later notes are audible.
  if (typeof (c as AudioContext).resume === 'function' && (c as AudioContext).state === 'suspended') {
    void (c as AudioContext).resume().catch(() => {})
  }
  const osc = c.createOscillator()
  const gain = c.createGain()
  const t = c.currentTime
  const peak = vol * masterVolume
  osc.type = type
  osc.frequency.value = freq
  // Envelope: short attack (no click), then a decaying ring.
  //
  // ROOT-CAUSE FIX (Test Suara silent while status showed "on"): the old
  // code set the peak then exponentialRampToValueAtTime(0.001) over the
  // whole duration — a 0.04-peak note fell below audibility within ~50 ms,
  // so the bell read as silence on laptop speakers. setTargetAtTime with
  // a time constant of duration/3 keeps the note ringing for its full
  // length, and the bell below now uses a much louder peak.
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.linearRampToValueAtTime(Math.max(peak, 0.0002), t + 0.005)
  gain.gain.setTargetAtTime(0.0001, t + 0.005, Math.max(duration / 3, 0.08))
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(t)
  osc.stop(t + duration + 0.25)
}

export function playTyping() {
  if (masterVolume === 0) return
  for (let i = 0; i < 3; i++) {
    setTimeout(() => beep(800 + Math.random() * 400, 0.03, 'square', 0.03), i * 60)
  }
}

export function playNotification() {
  beep(880, 0.1, 'sine', 0.06)
  setTimeout(() => beep(1100, 0.15, 'sine', 0.06), 120)
}

export function playCoffee() {
  if (masterVolume === 0) return
  for (let i = 0; i < 5; i++) {
    setTimeout(() => beep(150 + Math.random() * 100, 0.08, 'sawtooth', 0.02), i * 100)
  }
}

export function playAlarm() {
  if (masterVolume === 0) return
  let i = 0
  const interval = setInterval(() => {
    beep(i % 2 === 0 ? 600 : 900, 0.2, 'square', 0.06)
    i++
    if (i > 8) clearInterval(interval)
  }, 250)
}

export function playCelebration() {
  const notes = [523, 659, 784, 1047]
  notes.forEach((f, i) => {
    setTimeout(() => beep(f, 0.15, 'sine', 0.05), i * 100)
  })
}

export function playBell() {
  if (masterVolume === 0) return
  // Loud, clearly audible ding-ding: 880 Hz fundamental (small laptop
  // speakers reproduce it far better than 1400/1800 Hz), peaks
  // 0.25/0.20/0.15 at default volume instead of the old 0.04/0.03/0.02.
  beep(880, 0.35, 'sine', 0.5)
  setTimeout(() => beep(1320, 0.3, 'sine', 0.4), 150)
  setTimeout(() => beep(880, 0.25, 'sine', 0.3), 350)
}

/**
 * Test-bell for the "Test Suara" button: await the resume first, then
 * ring the loud bell. Returns whether audio is really running, so the
 * UI never claims "on" while the context is still suspended.
 */
export async function playTestBell(): Promise<boolean> {
  const ok = await resumeAudio()
  if (!ok) return false
  playBell()
  return true
}

/** Needs-you chime: three soft rising notes — Claude is waiting on you */
export function playNeedsYou() {
  if (masterVolume === 0) return
  beep(660, 0.12, 'sine', 0.07)
  setTimeout(() => beep(880, 0.12, 'sine', 0.07), 140)
  setTimeout(() => beep(1320, 0.22, 'sine', 0.08), 280)
}

export function playDoorOpen() {
  beep(200, 0.15, 'triangle', 0.04)
  setTimeout(() => beep(300, 0.1, 'triangle', 0.04), 100)
}

export function playError() {
  beep(200, 0.2, 'sawtooth', 0.05)
  setTimeout(() => beep(150, 0.3, 'sawtooth', 0.05), 200)
}

export function playPowerDown() {
  if (masterVolume === 0) return
  const c = getCtx()
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = 400
  osc.frequency.exponentialRampToValueAtTime(50, c.currentTime + 0.5)
  gain.gain.value = 0.06 * masterVolume
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + 0.6)
}

// ---------------------------------------------------------------------------
// Ambient sounds
// ---------------------------------------------------------------------------

let ambientOscNode: OscillatorNode | null = null
let ambientGainNode: GainNode | null = null
let ambientRunning = false

/**
 * Start a very quiet low-frequency hum that loops continuously.
 *
 * Does NOT mark `ambientRunning` when the context is still suspended:
 * an oscillator started on a suspended context is inaudible, and the
 * old code left the flag stuck so later unlocks never retried the hum.
 * The caller (unlock / unmute) retries after resume.
 */
export function playAmbientHum() {
  if (masterVolume === 0 || ambientRunning) return
  try {
    const c = getCtx()
    if ((c as AudioContext).state === 'suspended') {
      void (c as AudioContext).resume?.().catch(() => {})
      return
    }
    const osc = c.createOscillator()
    const gain = c.createGain()

    osc.type = 'sine'
    osc.frequency.value = 50 + Math.random() * 10  // 50-60 hz drone

    gain.gain.value = 0.015 * masterVolume

    osc.connect(gain)
    gain.connect(c.destination)
    osc.start()

    ambientOscNode = osc
    ambientGainNode = gain
    ambientRunning = true
  } catch (_) {
    // AudioContext may not be available in some environments
  }
}

/** Stop the ambient hum. */
export function stopAmbient() {
  if (!ambientRunning) return
  // Why: the fade-out owns the nodes it was called for. The module refs are
  // released now, so a hum restarted within the 300 ms fade (StrictMode's
  // mount/unmount/mount, a quick unmute) gets fresh nodes and is not stopped
  // by this timer.
  const osc = ambientOscNode
  const gain = ambientGainNode
  ambientOscNode = null
  ambientGainNode = null
  ambientRunning = false
  try {
    gain?.gain.setTargetAtTime(0, getCtx().currentTime, 0.1)
    setTimeout(() => {
      try { osc?.stop() } catch (_) { /* already stopped */ }
    }, 300)
  } catch (_) { /* ignore */ }
}

/** Update ambient gain when master volume changes (called internally). */
function syncAmbientVolume() {
  if (ambientGainNode) {
    try {
      ambientGainNode.gain.setTargetAtTime(
        masterVolume === 0 ? 0 : 0.015 * masterVolume,
        getCtx().currentTime,
        0.05,
      )
    } catch (_) { /* ignore */ }
  }
}

/** Random soft keyboard clatter — subtle typing noise for working agents. */
export function playKeyboardClatter() {
  if (masterVolume === 0) return
  const count = 2 + Math.floor(Math.random() * 4)  // 2-5 clicks
  for (let i = 0; i < count; i++) {
    const delay = i * (30 + Math.random() * 50)
    setTimeout(() => {
      beep(600 + Math.random() * 600, 0.02, 'square', 0.008 + Math.random() * 0.006)
    }, delay)
  }
}

// ---------------------------------------------------------------------------
// Volume control (0–1)
// ---------------------------------------------------------------------------
let preMuteVolume = 0.5  // restored when unmuting

export function setVolume(v: number) {
  masterVolume = Math.max(0, Math.min(1, v))
  if (masterVolume > 0) preMuteVolume = masterVolume
  syncAmbientVolume()
}
export function getVolume() { return masterVolume }
export function isMuted() { return masterVolume === 0 }
export function toggleMute() {
  if (masterVolume > 0) {
    preMuteVolume = masterVolume
    masterVolume = 0
  } else {
    masterVolume = preMuteVolume > 0 ? preMuteVolume : 0.5
  }
  syncAmbientVolume()
  return masterVolume === 0
}
