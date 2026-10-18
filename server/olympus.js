/**
 * olympus.js — Olympus adapter: Zeus (Manager, Muse) → office, live.
 *
 * Claude-Office was built for Claude Code hooks + status line. Muse
 * subagents are ephemeral (no hooks, no status line), so Zeus instead
 * writes `status.json` on every state change and/or POSTs it here:
 *
 *   POST /olympus/status  { runId, stage, agent, task, files, tickets,
 *                           gate, approval, agora }
 *   POST /olympus/status  { kind: 'gate_waiting', gate, docVersion }
 *   POST /olympus/status  { kind: 'agora_message', from, to, type, body, runId, stage }
 *     (a bare Agora message { from, to, type: 'minta-review', body } works
 *     too — `type` is the Agora type, so the envelope uses `kind`)
 *   GET  /olympus/status  → { olympus, gates, agora }
 *
 * Everything is broadcast to WS clients as `status_update` /
 * `gate_waiting` / `agora_message` (src/types.ts OfficeEvent).
 *
 * Optional polling: when OLYMPUS_STATUS_FILE (default <cwd>/status.json)
 * exists, it is re-read every 5 s; a change broadcasts `status_update`
 * (and `gate_waiting` when the file's gate.waiting is set). The file is
 * never required — POST alone is enough. Nothing here throws: a bad
 * payload or an unreadable file is a 400 / a skipped poll, never a crash.
 *
 * This is deliberately separate from POST /status (server/status.js),
 * which is the Claude Code status-line feed (session_status /
 * agent_status, bearer-token gated). Olympus posts carry no Claude Code
 * session and must not disturb that feed.
 */

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const MAX_AGORA = 100
const POLL_MS = 5000

function isRecord(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function cleanStatus(body) {
  const out = {}
  for (const k of ['runId', 'stage', 'agent', 'task', 'gate', 'approval']) {
    if (typeof body[k] === 'string') out[k] = body[k].slice(0, 2000)
  }
  for (const k of ['files', 'tickets']) {
    if (Array.isArray(body[k])) out[k] = body[k].filter(x => typeof x === 'string').map(x => x.slice(0, 500)).slice(0, 100)
  }
  if (Array.isArray(body.agora)) out.agora = body.agora.filter(isRecord).slice(0, MAX_AGORA)
  return out
}

function cleanAgora(body) {
  const types = ['tanya', 'info', 'minta-review', 'setuju', 'tolak', 'keputusan']
  return {
    from: typeof body.from === 'string' ? body.from.slice(0, 100) : 'Zeus',
    to: typeof body.to === 'string' ? body.to.slice(0, 100) : 'all',
    type: types.includes(body.type) ? body.type : 'info',
    body: typeof body.body === 'string' ? body.body.slice(0, 2000) : '',
    runId: typeof body.runId === 'string' ? body.runId.slice(0, 200) : undefined,
    stage: typeof body.stage === 'string' ? body.stage.slice(0, 200) : undefined,
    time: typeof body.time === 'string' ? body.time.slice(0, 100) : new Date().toTimeString().slice(0, 5),
  }
}

export function mountOlympus(app, { broadcast }) {
  const state = {
    olympus: null,
    gates: [],
    agora: [],
  }
  let lastPollSig = ''

  // NOTE: the Agora message's own `type` (tanya/info/...) collides with an
  // envelope `type`, so the envelope discriminator is `kind`. A bare Agora
  // message { from, to, type: 'minta-review', body } (no kind) is also
  // accepted: from+to+an Agora type is unambiguous.
  const AGORA_TYPES = ['tanya', 'info', 'minta-review', 'setuju', 'tolak', 'keputusan']
  const isAgoraBody = (b) => typeof b.from === 'string' && typeof b.to === 'string'
    && typeof b.body === 'string' && AGORA_TYPES.includes(b.type)

  app.post('/olympus/status', (req, res) => {
    const body = isRecord(req.body) ? req.body : {}
    try {
      if ((body.kind === 'gate_waiting' || body.type === 'gate_waiting') && typeof body.gate === 'string') {
        const gateWaiting = { gate: body.gate.slice(0, 200), docVersion: typeof body.docVersion === 'string' ? body.docVersion.slice(0, 200) : undefined }
        broadcast({ type: 'gate_waiting', gateWaiting, timestamp: Date.now() })
        return res.json({ ok: true, broadcast: 'gate_waiting' })
      }
      if (body.kind === 'agora_message' || isAgoraBody(body)) {
        const msg = cleanAgora(body)
        state.agora = [...state.agora, msg].slice(-MAX_AGORA)
        broadcast({ type: 'agora_message', agoraMessage: msg, timestamp: Date.now() })
        return res.json({ ok: true, broadcast: 'agora_message' })
      }
      const olympus = cleanStatus(body)
      state.olympus = { ...state.olympus, ...olympus }
      if (Array.isArray(body.agora)) {
        state.agora = [...state.agora, ...body.agora.filter(isRecord).map(cleanAgora)].slice(-MAX_AGORA)
      }
      broadcast({ type: 'status_update', olympus: state.olympus, timestamp: Date.now() })
      return res.json({ ok: true, broadcast: 'status_update' })
    } catch (err) {
      return res.status(400).json({ ok: false, error: String(err?.message ?? err) })
    }
  })

  app.get('/olympus/status', (_req, res) => {
    res.json({ ok: true, olympus: state.olympus, gates: state.gates, agora: state.agora })
  })

  // Optional status.json polling: <cwd>/status.json unless OLYMPUS_STATUS_FILE set.
  const statusFile = process.env.OLYMPUS_STATUS_FILE || join(process.cwd(), 'status.json')
  const poll = () => {
    try {
      if (!existsSync(statusFile)) return
      const raw = readFileSync(statusFile, 'utf8')
      const sig = `${raw.length}:${raw.slice(0, 64)}`
      if (sig === lastPollSig) return
      lastPollSig = sig
      const parsed = JSON.parse(raw)
      if (!isRecord(parsed)) return
      const olympus = cleanStatus(parsed)
      state.olympus = { ...state.olympus, ...olympus }
      broadcast({ type: 'status_update', olympus: state.olympus, timestamp: Date.now() })
      if (isRecord(parsed.gate) && parsed.gate.waiting) {
        broadcast({
          type: 'gate_waiting',
          gateWaiting: { gate: String(parsed.gate.waiting).slice(0, 200), docVersion: typeof parsed.gate.docVersion === 'string' ? parsed.gate.docVersion : undefined },
          timestamp: Date.now(),
        })
      }
      if (Array.isArray(parsed.agora)) {
        const fresh = parsed.agora.filter(isRecord).map(cleanAgora)
        const known = new Set(state.agora.map(m => `${m.from}|${m.to}|${m.body}`))
        for (const m of fresh) {
          if (!known.has(`${m.from}|${m.to}|${m.body}`)) {
            state.agora = [...state.agora, m].slice(-MAX_AGORA)
            broadcast({ type: 'agora_message', agoraMessage: m, timestamp: Date.now() })
          }
        }
      }
    } catch (_) {
      // Unreadable / invalid status.json: skip this poll, never crash.
    }
  }
  const timer = setInterval(poll, POLL_MS)
  if (typeof timer.unref === 'function') timer.unref()

  return { state, poll }
}
