/**
 * Slash commands — client-side (src/slashCommands.ts). Every command answers
 * from a state snapshot, no backend: on Vercel (static frontend) a relayed
 * command used to vanish with no reply.
 */
import { describe, expect, it } from 'vitest'
import { parseSlashCommand, slashReply, type SlashSnapshot } from '../src/slashCommands'

const SNAP: SlashSnapshot = {
  agents: [
    { label: '⚡ Zeus · Manager', state: 'working', task: 'Review spec' },
    { label: '🔨 Hephaestus · Frontend', state: 'completed' },
    { label: '👁️ Argus · QC', state: 'idle' },
  ],
  gates: [
    { id: '0.5', label: 'Brief Confirm', status: 'passed' },
    { id: '1.75', label: 'Planning Approval', status: 'waiting' },
    { id: '5.5', label: 'Demo Preview', status: 'locked' },
  ],
  dayNightMode: 'day',
  incident: false,
  olympus: { runId: 'r1', stage: '3', agent: 'Hephaestus', task: 'Build panel' },
}

describe('parseSlashCommand', () => {
  it('returns null for plain chat', () => {
    expect(parseSlashCommand('hello team')).toBeNull()
    expect(parseSlashCommand('')).toBeNull()
  })
  it('lowercases the command word and ignores args', () => {
    expect(parseSlashCommand('/STATUS now')).toBe('/status')
    expect(parseSlashCommand('  /Help  ')).toBe('/help')
  })
})

describe('slashReply', () => {
  it('/help lists all live commands and never mentions /the-office as active', () => {
    const { reply } = slashReply('/help', SNAP)
    for (const cmd of ['/status', '/agents', '/incident', '/all-clear', '/help']) {
      expect(reply).toContain(cmd)
    }
  })
  it('/status summarizes mode, waiting gate, agent counts and the run from the snapshot', () => {
    const { reply } = slashReply('/status', SNAP)
    expect(reply).toContain('DAY')
    expect(reply).toContain('Gate 1.75')
    expect(reply).toContain('3 total')
    expect(reply).toContain('1 bekerja')
    expect(reply).toContain('Run r1')
    expect(reply).toContain('Stage 3')
  })
  it('/status says no gate is waiting when none is', () => {
    const snap = { ...SNAP, gates: SNAP.gates.map(g => ({ ...g, status: 'passed' })) }
    expect(slashReply('/status', snap).reply).toContain('tidak ada gate menunggu')
  })
  it('/agents lists every agent with state and task', () => {
    const { reply } = slashReply('/agents', SNAP)
    expect(reply).toContain('Zeus · Manager — working — Review spec')
    expect(reply).toContain('Hephaestus · Frontend — completed')
  })
  it('/incident returns the incident action only when incident is off', () => {
    expect(slashReply('/incident', SNAP).action).toBe('incident')
    expect(slashReply('/incident', { ...SNAP, incident: true }).action).toBeUndefined()
    expect(slashReply('/incident', { ...SNAP, incident: true }).reply).toContain('sudah aktif')
  })
  it('/all-clear returns the all-clear action only when incident is on', () => {
    expect(slashReply('/all-clear', SNAP).action).toBeUndefined()
    expect(slashReply('/all-clear', { ...SNAP, incident: true }).action).toBe('all-clear')
  })
  it('/the-office is parked, never a theme switch', () => {
    const { reply, action } = slashReply('/the-office', SNAP)
    expect(action).toBeUndefined()
    expect(reply).toMatch(/diparkir/i)
  })
  it('unknown commands say so and point to /help', () => {
    const { reply } = slashReply('/foo', SNAP)
    expect(reply).toContain('/foo')
    expect(reply).toContain('/help')
  })
})
