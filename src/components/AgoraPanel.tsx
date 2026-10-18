/**
 * AgoraPanel — the shared, auditable message board gods use to talk to each
 * other. No private DMs. Every message is logged and visible here.
 *
 * Message: { from, to, type, body, runId, stage, time }. Types: tanya /
 * info / minta-review / setuju / tolak / keputusan (only Zeus may post
 * `keputusan`). A decision living only in chat between 2 gods does NOT
 * count — Zeus posts `keputusan` + records it.
 *
 * Click a message to highlight the two gods involved: the sender is
 * inspected and its bubble shows the body verbatim.
 */

import React from 'react'
import type { AgoraMessage } from '../types'

export const AGORA_SEED: AgoraMessage[] = [
  {
    from: 'Hephaestus', to: 'Hades', type: 'minta-review',
    body: 'Butuh field avatar_url di contract draft, frontend butuh URL avatar per dewa',
    stage: 'F', time: '10:02',
  },
  {
    from: 'Hades', to: 'Hephaestus', type: 'info',
    body: 'Ditambah ke contract draft v0',
    stage: 'F', time: '10:04',
  },
  {
    from: 'Athena', to: 'Apollo', type: 'minta-review',
    body: 'Spec Lock v2 sudah siap — cek apakah design token Olympus konsisten?',
    stage: '1', time: '09:41',
  },
  {
    from: 'Zeus', to: 'all', type: 'keputusan',
    body: 'Contract draft v0 ditambah avatar_url — dicatat, lanjut Stage F',
    stage: 'F', time: '10:05',
  },
]

const TYPE_CLASS: Record<AgoraMessage['type'], string> = {
  tanya: 'agora-tanya',
  info: 'agora-info',
  'minta-review': 'agora-review',
  setuju: 'agora-setuju',
  tolak: 'agora-tolak',
  keputusan: 'agora-keputusan',
}

interface AgoraPanelProps {
  messages: AgoraMessage[]
  selectedIdx: number | null
  onSelect: (idx: number, msg: AgoraMessage) => void
}

const AgoraPanel: React.FC<AgoraPanelProps> = ({ messages, selectedIdx, onSelect }) => (
  <div className="olympus-panel agora-panel">
    <div className="olympus-panel-head">
      <span>💬 Agora</span>
      <span className="olympus-panel-hint">papan pesan dewa — no DM</span>
    </div>
    {messages.length === 0 ? (
      <div className="agora-empty">Belum ada pesan Agora.</div>
    ) : (
      <ul className="agora-list">
        {messages.map((m, i) => (
          <li key={`${m.time}-${i}`}>
            <button
              type="button"
              className={`agora-msg ${selectedIdx === i ? 'agora-selected' : ''}`}
              onClick={() => onSelect(i, m)}
              title="Klik untuk highlight kedua dewa"
            >
              <span className="agora-from-to">
                <strong>{m.from}</strong>
                <span className="agora-arrow"> → </span>
                <strong>{m.to}</strong>
              </span>
              <span className={`agora-type ${TYPE_CLASS[m.type]}`}>{m.type}</span>
              <span className="agora-body">{m.body}</span>
              <span className="agora-meta">
                {m.stage ? `Stage ${m.stage}` : ''}{m.stage && m.time ? ' · ' : ''}{m.time ?? ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )}
  </div>
)

export default AgoraPanel
