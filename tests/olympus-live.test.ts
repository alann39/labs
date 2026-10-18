/**
 * Olympus LIVE polling (src/olympusLive.ts): parse + fetch of status.json
 * for Vercel LIVE mode (no WS server). Parsing never throws on bad input —
 * it returns null / a typed error the UI turns into an empty state.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  fetchOlympusStatus,
  olympusSnapshotSignature,
  parseOlympusStatusFile,
} from '../src/olympusLive'

const FULL = {
  runId: 'demo-run-001',
  stage: '3',
  agent: 'Hephaestus',
  task: 'Membangun GatesPanel',
  files: ['src/App.tsx'],
  tickets: ['QC-1'],
  gate: { waiting: '1.75', docVersion: 'brief v2' },
  approval: null,
  agora: [
    { from: 'Hephaestus', to: 'Hades', type: 'minta-review', body: 'Butuh field avatar_url', stage: 'F', time: '10:02' },
    { from: 'Zeus', to: 'all', type: 'keputusan', body: 'Dicatat, lanjut', stage: 'F', time: '10:05' },
  ],
  gates: [
    { id: '0.5', status: 'passed', decision: { choice: 'Gas', at: '09:30', docVersion: 'brief v1' } },
    { id: '1.75', status: 'waiting' },
    { id: 'bogus-gate', status: 'passed' },
  ],
  runActive: true,
  updatedAt: '2026-10-18T10:00:00+07:00',
}

describe('parseOlympusStatusFile', () => {
  it('parses a full status.json into olympus + gates + agora + gateWaiting', () => {
    const s = parseOlympusStatusFile(FULL)
    expect(s).not.toBeNull()
    expect(s!.olympus.runId).toBe('demo-run-001')
    expect(s!.olympus.agent).toBe('Hephaestus')
    expect(s!.gateWaiting).toEqual({ gate: '1.75', docVersion: 'brief v2' })
    expect(s!.hasGateKey).toBe(true)
    expect(s!.runActive).toBe(true)
    expect(s!.updatedAt).toBe('2026-10-18T10:00:00+07:00')
    expect(s!.agora).toHaveLength(2)
    expect(s!.agora![1].type).toBe('keputusan')
    expect(s!.gates).toHaveLength(7)
    expect(s!.gates!.find(g => g.id === '0.5')!.status).toBe('passed')
    expect(s!.gates!.find(g => g.id === '0.5')!.decision!.choice).toBe('Gas')
    expect(s!.gates!.find(g => g.id === 'bogus-gate')).toBeUndefined()
  })
  it('accepts the string gate form ("1.75" = waiting on 1.75)', () => {
    const s = parseOlympusStatusFile({ runId: 'r', gate: '1.6' })
    expect(s!.gateWaiting).toEqual({ gate: '1.6', docVersion: undefined })
    expect(s!.hasGateKey).toBe(true)
  })
  it('treats gate { waiting: null } as no gate waiting', () => {
    const s = parseOlympusStatusFile({ runId: 'r', gate: { waiting: null, docVersion: null } })
    expect(s!.gateWaiting).toBeNull()
    expect(s!.hasGateKey).toBe(true)
  })
  it('treats runActive false as a finished run (Run terakhir)', () => {
    const s = parseOlympusStatusFile({ runId: 'r', runActive: false })
    expect(s!.runActive).toBe(false)
  })
  it('cleans bad Agora entries (unknown type → info, missing body dropped)', () => {
    const s = parseOlympusStatusFile({
      runId: 'r',
      agora: [
        { from: 'A', to: 'B', type: 'nope', body: 'x' },
        { from: 'A', to: 'B', type: 'info' },
        'junk',
      ],
    })
    expect(s!.agora).toHaveLength(1)
    expect(s!.agora![0].type).toBe('info')
  })
  it('returns null for non-objects and identity-less files', () => {
    expect(parseOlympusStatusFile(null)).toBeNull()
    expect(parseOlympusStatusFile([])).toBeNull()
    expect(parseOlympusStatusFile('nope')).toBeNull()
    expect(parseOlympusStatusFile({})).toBeNull()
    expect(parseOlympusStatusFile({ files: [] })).toBeNull()
  })
  it('ignores a gates array with no known gate (gates stays undefined)', () => {
    const s = parseOlympusStatusFile({ runId: 'r', gates: [{ id: 'nope', status: 'passed' }] })
    expect(s!.gates).toBeUndefined()
  })
})

describe('fetchOlympusStatus', () => {
  const okFetch = (body: unknown) => vi.fn().mockResolvedValue({
    ok: true, status: 200, text: async () => JSON.stringify(body),
  })
  it('fetches + parses a valid file', async () => {
    const { snapshot } = await fetchOlympusStatus(okFetch(FULL) as unknown as typeof fetch)
    expect(snapshot.olympus.runId).toBe('demo-run-001')
  })
  it('throws not-found on 404 (status.json not committed yet)', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => '' })
    await expect(fetchOlympusStatus(f as unknown as typeof fetch)).rejects.toMatchObject({ kind: 'not-found' })
  })
  it('throws invalid on bad JSON / identity-less JSON', async () => {
    const badJson = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{oops' })
    await expect(fetchOlympusStatus(badJson as unknown as typeof fetch)).rejects.toMatchObject({ kind: 'invalid' })
    const empty = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '{}' })
    await expect(fetchOlympusStatus(empty as unknown as typeof fetch)).rejects.toMatchObject({ kind: 'invalid' })
  })
  it('throws network on fetch rejection', async () => {
    const f = vi.fn().mockRejectedValue(new Error('down'))
    await expect(fetchOlympusStatus(f as unknown as typeof fetch)).rejects.toMatchObject({ kind: 'network' })
  })
})

describe('olympusSnapshotSignature', () => {
  it('is stable for identical text, different for changed text', () => {
    expect(olympusSnapshotSignature('abc')).toBe(olympusSnapshotSignature('abc'))
    expect(olympusSnapshotSignature('abc')).not.toBe(olympusSnapshotSignature('abd'))
  })
})

describe('parseOlympusStatusFile — agents[]', () => {
  const EIGHT = [
    { god: 'Zeus', state: 'working', task: 'Menjalankan run' },
    { god: 'Athena', state: 'done', task: 'Spec selesai' },
    { god: 'Apollo', state: 'idle', task: 'Menunggu arah' },
    { god: 'Hephaestus', state: 'working', task: 'Membangun panel' },
    { god: 'Hades', state: 'standby' },
    { god: 'Argus', state: 'reviewing', task: 'QC build' },
    { god: 'Ares', state: 'idle', task: 'Security siap' },
    { god: 'Hermes', state: 'standby', task: 'Menunggu ship' },
  ]
  it('parses 8 gods with states mapped to office AgentState', () => {
    const s = parseOlympusStatusFile({ runId: 'r', agents: EIGHT })
    expect(s!.agents).toHaveLength(8)
    const byRole = Object.fromEntries(s!.agents!.map(a => [a.role, a]))
    expect(byRole.zeus.isBoss).toBe(true)
    expect(byRole.zeus.agentId).toBe('live-zeus')
    expect(byRole.athena.agentId).toBe('live-athena')
    expect(byRole.hephaestus.agentState).toBe('working')
    expect(byRole.hephaestus.statusText).toBe('Membangun panel')
    expect(byRole.argus.agentState).toBe('working') // reviewing → working
    expect(byRole.argus.statusText).toBe('reviewing — QC build')
    expect(byRole.athena.agentState).toBe('idle') // done → idle
    expect(byRole.athena.statusText).toBe('✅ Spec selesai')
    expect(byRole.hades.statusText).toBe('standby') // no task → state word
    expect(byRole.zeus.god).toBe('Zeus')
  })
  it('god matching is case-insensitive; unknown gods are skipped', () => {
    const s = parseOlympusStatusFile({
      runId: 'r',
      agents: [
        { god: 'ATHENA', state: 'working', task: 'x' },
        { god: 'Thor', state: 'working', task: 'x' },
        { god: '', state: 'working' },
        { god: 'athena', state: 'idle', task: 'duplikat' },
        'bukan-record',
      ],
    })
    expect(s!.agents).toHaveLength(1) // only ATHENA; Thor skipped, dup skipped
    expect(s!.agents![0].role).toBe('athena')
    expect(s!.agents![0].god).toBe('Athena')
  })
  it('unknown state falls back to idle; task truncated to 60 chars', () => {
    const s = parseOlympusStatusFile({
      runId: 'r',
      agents: [{ god: 'Hades', state: 'meditating', task: 'x'.repeat(100) }],
    })
    expect(s!.agents![0].agentState).toBe('idle')
    expect(s!.agents![0].task).toHaveLength(60)
    expect(s!.agents![0].statusText).toHaveLength(60)
  })
  it('missing agents → undefined (old behavior); empty array → undefined', () => {
    expect(parseOlympusStatusFile({ runId: 'r' })!.agents).toBeUndefined()
    expect(parseOlympusStatusFile({ runId: 'r', agents: [] })!.agents).toBeUndefined()
    expect(parseOlympusStatusFile({ runId: 'r', agents: [{ god: 'Thor' }] })!.agents).toBeUndefined()
  })
  it('a file with only a valid agents array counts as live identity', () => {
    const s = parseOlympusStatusFile({ agents: [{ god: 'Zeus', state: 'idle' }] })
    expect(s).not.toBeNull()
    expect(s!.agents).toHaveLength(1)
  })
  it('the single `agent` field is untouched (backward compatible)', () => {
    const s = parseOlympusStatusFile({ runId: 'r', agent: 'Hephaestus', agents: EIGHT })
    expect(s!.olympus.agent).toBe('Hephaestus')
    expect(s!.agents).toHaveLength(8)
  })
})
