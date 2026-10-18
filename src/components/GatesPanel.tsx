/**
 * GatesPanel — the workflow gates (local-dev-team). Gates are HARD stops:
 * the run PAUSES and no code moves forward until the owner decides.
 *
 * V1: Gas / Revisi / Stop write an approval record into state and show a
 * toast ("Approval tercatat — eksekusi via chat"). They do NOT auto-deploy
 * or auto-resume the run — the Manager executes the decision in chat.
 */

import React from 'react'
import type { GateInfo, GateStatus } from '../types'

export const GATE_DEFS: Array<{ id: string; label: string; mode: 'A' | 'B' | 'A/B' }> = [
  { id: '0.5', label: '0.5 Brief Confirm', mode: 'A/B' },
  { id: '1.6', label: '1.6 UI Direction + Mockup', mode: 'A/B' },
  { id: '1.75', label: '1.75 Planning Approval', mode: 'A' },
  { id: 'F', label: 'F Frontend Oke', mode: 'B' },
  { id: 'S', label: 'S Sambungin Gate', mode: 'B' },
  { id: '5.5', label: '5.5 Demo Preview', mode: 'A/B' },
  { id: '6', label: '6 Ship Gate (gas)', mode: 'A/B' },
]

export function initialGates(): GateInfo[] {
  return GATE_DEFS.map((g, i) => ({
    ...g,
    status: (i === 0 ? 'active' : 'locked') as GateStatus,
  }))
}

const STATUS_LABEL: Record<GateStatus, string> = {
  locked: '🔒 Locked',
  active: '▶ Active',
  waiting: '⏸ Waiting',
  passed: '✅ Passed',
  revisi: '↩ Revisi',
  stopped: '⛔ Stopped',
}

interface GatesPanelProps {
  gates: GateInfo[]
  onDecision: (gateId: string, choice: 'Gas' | 'Revisi' | 'Stop') => void
}

const GatesPanel: React.FC<GatesPanelProps> = ({ gates, onDecision }) => (
  <div className="olympus-panel gates-panel">
    <div className="olympus-panel-head">
      <span>🏛️ Gates</span>
      <span className="olympus-panel-hint">HARD stop — tunggu approval lo</span>
    </div>
    <ul className="gates-list">
      {gates.map(g => (
        <li key={g.id} className={`gate-row gate-${g.status}`}>
          <div className="gate-row-top">
            <span className="gate-label">{g.label}</span>
            <span className="gate-mode">{g.mode === 'A/B' ? 'A/B' : `Mode ${g.mode}`}</span>
            <span className="gate-status">{STATUS_LABEL[g.status]}</span>
          </div>
          {g.decision && (
            <div className="gate-decision">
              {g.decision.choice} · {g.decision.at}
              {g.decision.docVersion ? ` · ${g.decision.docVersion}` : ''}
            </div>
          )}
          {g.status === 'waiting' && (
            <div className="gate-actions">
              <button type="button" className="gate-btn gate-gas" onClick={() => onDecision(g.id, 'Gas')}>Gas</button>
              <button type="button" className="gate-btn gate-revisi" onClick={() => onDecision(g.id, 'Revisi')}>Revisi</button>
              <button type="button" className="gate-btn gate-stop" onClick={() => onDecision(g.id, 'Stop')}>Stop</button>
            </div>
          )}
        </li>
      ))}
    </ul>
  </div>
)

export default GatesPanel
