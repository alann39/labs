/**
 * olympusLive.ts — Vercel LIVE mode: poll status.json, no WS server.
 *
 * On Vercel the frontend is static: there is no long-lived WebSocket
 * server (serverless cannot hold one), so the local adapter
 * (server/olympus.js: POST /olympus/status + WS broadcast) cannot reach
 * the deployed dashboard. Instead, in LIVE mode (any URL WITHOUT ?sim)
 * the browser polls the run's `status.json` straight from the public repo
 * every 5 s:
 *
 *   https://raw.githubusercontent.com/alann39/labs/main/status.json
 *
 * The repo is public, so no token/auth is needed — and none is hardcoded
 * here. raw.githubusercontent is used (not the Vercel deployment's own
 * /status.json) because a new commit lands in raw within seconds, while
 * the deployment's copy only changes after a redeploy.
 *
 * Zeus (Manager) writes status.json on every state change — same shape
 * the local adapter accepts (see status.example.json at repo root).
 * This module only parses + cleans that file into the SAME state the WS
 * handlers in App.tsx consume (olympus / gates / agora / gateWaiting),
 * so Live and WS-local render identically. It never touches the DOM.
 */

import type { AgoraMessage, GateInfo, GateStatus, OlympusStatus } from './types'
import { GATE_DEFS } from './components/GatesPanel'

/** Where the live run status lives (public repo, no auth). */
export const OLYMPUS_STATUS_URL =
  'https://raw.githubusercontent.com/alann39/labs/main/status.json'

/** Poll cadence — matches the local adapter's status.json poll (5 s). */
export const OLYMPUS_POLL_MS = 5000

const AGORA_TYPES: AgoraMessage['type'][] = [
  'tanya', 'info', 'minta-review', 'setuju', 'tolak', 'keputusan',
]

const GATE_STATUSES: GateStatus[] = [
  'locked', 'active', 'waiting', 'passed', 'revisi', 'stopped',
]

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function cleanStr(v: unknown, max: number): string | undefined {
  return typeof v === 'string' ? v.slice(0, max) : undefined
}

function cleanStrArray(v: unknown, maxItem: number, maxLen: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.filter((x): x is string => typeof x === 'string').map(x => x.slice(0, maxItem)).slice(0, maxLen)
}

function cleanAgora(v: unknown): AgoraMessage[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: AgoraMessage[] = []
  for (const m of v) {
    if (!isRecord(m)) continue
    const from = cleanStr(m.from, 100)
    const to = cleanStr(m.to, 100)
    const body = cleanStr(m.body, 2000)
    if (!from || !to || body === undefined) continue
    out.push({
      from,
      to,
      type: AGORA_TYPES.includes(m.type as AgoraMessage['type']) ? (m.type as AgoraMessage['type']) : 'info',
      body,
      runId: cleanStr(m.runId, 200),
      stage: cleanStr(m.stage, 200),
      time: cleanStr(m.time, 100),
    })
  }
  return out.slice(-100)
}

function cleanGates(v: unknown): GateInfo[] | undefined {
  if (!Array.isArray(v)) return undefined
  const byId = new Map<string, GateInfo>()
  for (const g of v) {
    if (!isRecord(g) || typeof g.id !== 'string') continue
    const def = GATE_DEFS.find(d => d.id === g.id)
    if (!def) continue // unknown gate id: ignore, never invent a gate
    const status = GATE_STATUSES.includes(g.status as GateStatus)
      ? (g.status as GateStatus)
      : 'locked'
    const gate: GateInfo = { ...def, status }
    if (isRecord(g.decision) && (g.decision.choice === 'Gas' || g.decision.choice === 'Revisi' || g.decision.choice === 'Stop')) {
      gate.decision = {
        choice: g.decision.choice,
        at: cleanStr(g.decision.at, 100) ?? '',
        docVersion: cleanStr(g.decision.docVersion, 200),
      }
    }
    byId.set(def.id, gate)
  }
  if (byId.size === 0) return undefined
  // Gates the file does not mention keep the default (locked, first active).
  return GATE_DEFS.map((def, i) => byId.get(def.id) ?? {
    ...def,
    status: (i === 0 ? 'active' : 'locked') as GateStatus,
  })
}

/** What one status.json file means for the dashboard. */
export interface OlympusLiveSnapshot {
  olympus: OlympusStatus
  /** Present only when the file has an `agora` array. */
  agora?: AgoraMessage[]
  /** Present only when the file has a `gates` array with a known gate. */
  gates?: GateInfo[]
  /** True when the file carries a `gate` key at all (waiting / null / string). */
  hasGateKey: boolean
  /** The gate waiting on the owner, or null when no gate is waiting. */
  gateWaiting: { gate: string; docVersion?: string } | null
  /** false = this file is the LAST state of a finished run. null = unstated. */
  runActive: boolean | null
  updatedAt?: string
}

/**
 * Parse + clean one status.json document. Returns null when the document
 * is not a usable run-status object (wrong shape, empty) — the caller
 * treats that as "no live data", never crashes.
 */
export function parseOlympusStatusFile(parsed: unknown): OlympusLiveSnapshot | null {
  if (!isRecord(parsed)) return null
  const olympus: OlympusStatus = {}
  const runId = cleanStr(parsed.runId, 2000)
  const stage = cleanStr(parsed.stage, 2000)
  const agent = cleanStr(parsed.agent, 2000)
  const task = cleanStr(parsed.task, 2000)
  const gateStr = cleanStr(parsed.gate, 2000)
  const approval = cleanStr(parsed.approval, 2000)
  const files = cleanStrArray(parsed.files, 500, 100)
  const tickets = cleanStrArray(parsed.tickets, 500, 100)
  if (runId !== undefined) olympus.runId = runId
  if (stage !== undefined) olympus.stage = stage
  if (agent !== undefined) olympus.agent = agent
  if (task !== undefined) olympus.task = task
  if (gateStr !== undefined) olympus.gate = gateStr
  if (approval !== undefined) olympus.approval = approval
  if (files !== undefined) olympus.files = files
  if (tickets !== undefined) olympus.tickets = tickets
  const agora = cleanAgora(parsed.agora)
  if (agora !== undefined) olympus.agora = agora

  // Gate: { waiting, docVersion } (adapter form) | "1.75" (string form) |
  // null / missing (no gate waiting). A `gate` key with a plain object but
  // no `waiting` means "no gate waiting" — NOT an error.
  let hasGateKey = false
  let gateWaiting: OlympusLiveSnapshot['gateWaiting'] = null
  if ('gate' in parsed) {
    hasGateKey = true
    if (isRecord(parsed.gate)) {
      const waiting = cleanStr(parsed.gate.waiting, 200)
      if (waiting) {
        gateWaiting = { gate: waiting, docVersion: cleanStr(parsed.gate.docVersion, 200) }
      }
    } else if (typeof parsed.gate === 'string' && parsed.gate) {
      gateWaiting = { gate: parsed.gate.slice(0, 200) }
    }
  }

  const runActive = typeof parsed.runActive === 'boolean' ? parsed.runActive : null
  const updatedAt = cleanStr(parsed.updatedAt, 200)

  // A file with no run identity and no messages and no gate is not live data.
  const hasIdentity = runId !== undefined || stage !== undefined || agent !== undefined
    || task !== undefined || (agora !== undefined && agora.length > 0) || gateWaiting !== null
  if (!hasIdentity) return null

  return {
    olympus,
    agora,
    gates: cleanGates(parsed.gates),
    hasGateKey,
    gateWaiting,
    runActive,
    updatedAt,
  }
}

/** Fetch error kinds the UI distinguishes (empty-state copy differs). */
export type OlympusFetchErrorKind = 'not-found' | 'network' | 'invalid'

export class OlympusFetchError extends Error {
  kind: OlympusFetchErrorKind
  constructor(kind: OlympusFetchErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

/**
 * Fetch + parse the live status.json. `fetchFn` is injectable for tests
 * (defaults to global fetch). The `?v=` cache-buster forces a fresh
 * response — raw.githubusercontent may otherwise serve a cached copy.
 */
export async function fetchOlympusStatus(
  fetchFn: typeof fetch = fetch,
): Promise<{ rawText: string; snapshot: OlympusLiveSnapshot }> {
  let res: Response
  try {
    res = await fetchFn(`${OLYMPUS_STATUS_URL}?v=${Date.now()}`, { cache: 'no-store' })
  } catch {
    throw new OlympusFetchError('network', 'Gagal mengambil status.json (network)')
  }
  if (res.status === 404) {
    throw new OlympusFetchError('not-found', 'status.json belum ada (404)')
  }
  if (!res.ok) {
    throw new OlympusFetchError('network', `status.json HTTP ${res.status}`)
  }
  const rawText = await res.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    throw new OlympusFetchError('invalid', 'status.json bukan JSON valid')
  }
  const snapshot = parseOlympusStatusFile(parsed)
  if (!snapshot) {
    throw new OlympusFetchError('invalid', 'status.json bukan status run yang valid')
  }
  return { rawText, snapshot }
}

/** Change signature: re-apply only when the file actually changed, so a
 * local gate decision (Gas/Revisi/Stop click) is not reverted by the next
 * poll while the file is unchanged. FNV-1a over the raw text. */
export function olympusSnapshotSignature(rawText: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < rawText.length; i++) {
    h ^= rawText.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${rawText.length}:${(h >>> 0).toString(16)}`
}

/** LIVE ↔ SIM navigation: same page, ?sim toggled, full reload. The
 * reload is deliberate — ?sim changes initial office state, the sim
 * loop, and the WS connection, so a soft state flip would leave a
 * half-sim / half-live office. Other query params are preserved. */
export function liveModeUrl(): string {
  const url = new URL(window.location.href)
  url.searchParams.delete('sim')
  url.searchParams.delete('video')
  return url.toString()
}

export function simModeUrl(): string {
  const url = new URL(window.location.href)
  url.searchParams.delete('video')
  url.searchParams.set('sim', '1')
  return url.toString()
}
