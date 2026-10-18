/**
 * Slash commands in chat — client-side only (src/components/SlackChat.tsx
 * hands every `/...` line to App.handleSendMessage, which answers here).
 *
 * Why client-side: on Vercel the office is a static frontend with no server,
 * so commands relayed to a backend vanished with no reply. These run in the
 * browser from state the page already has — no fetch, no backend.
 * /incident + /all-clear still switch this tab immediately via dispatchIncident;
 * multi-tab sync through the server relay is out of scope for this fix.
 */

export interface SlashAgentSnapshot {
  label: string
  state: string
  task?: string
}

export interface SlashGateSnapshot {
  id: string
  label: string
  status: string
}

export interface SlashSnapshot {
  agents: SlashAgentSnapshot[]
  gates: SlashGateSnapshot[]
  dayNightMode: string
  incident: boolean
  olympus?: { runId?: string; stage?: string; agent?: string; task?: string } | null
}

export type SlashAction = 'incident' | 'all-clear'

export const SLASH_HELP =
  'Perintah chat:\n' +
  '/status — ringkasan status office (mode, gate, agent, incident)\n' +
  '/agents — daftar dewa + status masing-masing\n' +
  '/incident — nyalakan mode PROD IS DOWN\n' +
  '/all-clear — matikan mode incident\n' +
  '/help — daftar perintah ini'

/** The slash-menu command list (kept in sync with SLASH_HELP). */
export const SLASH_COMMANDS = ['/status', '/agents', '/help', '/incident', '/all-clear'] as const

/**
 * Commands matching a bare "/..." input word (prefix filter). Returns [] when
 * the input is not a bare slash word (plain chat, or a command with args —
 * the menu closes and Enter sends the line as typed).
 */
export function filterSlashCommands(input: string): string[] {
  if (!input.startsWith('/')) return []
  if (/\s/.test(input)) return []
  const prefix = input.toLowerCase()
  return SLASH_COMMANDS.filter(c => c.startsWith(prefix))
}

/** Move the menu highlight by delta with wrap-around (last → first, first → last). */
export function moveSlashHighlight(current: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return 0
  return (current + delta + count) % count
}

/** The command word of a chat line, or null when it is not a slash command. */
export function parseSlashCommand(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('/')) return null
  return trimmed.split(/\s+/)[0].toLowerCase()
}

/** The system reply (and optional incident action) for a slash command. */
export function slashReply(cmd: string, snap: SlashSnapshot): { reply: string; action?: SlashAction } {
  switch (cmd) {
    case '/help':
      return { reply: SLASH_HELP }

    case '/status': {
      const waiting = snap.gates.filter(g => g.status === 'waiting')
      const active = snap.gates.filter(g => g.status === 'active')
      const working = snap.agents.filter(a => a.state === 'working').length
      const done = snap.agents.filter(a => a.state === 'completed').length
      const lines = [
        `Mode: ${snap.dayNightMode.toUpperCase()} — Incident: ${snap.incident ? 'ON 🔥 PROD IS DOWN' : 'off ✅'}`,
        `Gate: ${waiting.length > 0
          ? `menunggu approval — Gate ${waiting.map(g => g.id).join(', ')}`
          : active.length > 0
            ? `aktif — Gate ${active.map(g => g.id).join(', ')}`
            : 'tidak ada gate menunggu'}`,
        `Agent: ${snap.agents.length} total — ${working} bekerja, ${done} selesai`,
      ]
      if (snap.olympus) {
        const run = snap.olympus.runId ? `Run ${snap.olympus.runId}` : 'Run —'
        const stage = snap.olympus.stage ? ` · Stage ${snap.olympus.stage}` : ''
        const work = snap.olympus.agent
          ? ` · ${snap.olympus.agent}${snap.olympus.task ? ` — ${snap.olympus.task}` : ''}`
          : ''
        lines.push(`${run}${stage}${work}`)
      }
      return { reply: lines.join('\n') }
    }

    case '/agents': {
      if (snap.agents.length === 0) return { reply: 'Belum ada agent di office.' }
      const lines = snap.agents.map(a =>
        `${a.label} — ${a.state}${a.task ? ` — ${a.task}` : ''}`)
      return { reply: lines.join('\n') }
    }

    case '/incident':
      if (snap.incident) return { reply: 'Mode incident sudah aktif 🔥' }
      return { reply: '🔥 Mode incident dinyalakan — PROD IS DOWN', action: 'incident' }

    case '/all-clear':
      if (!snap.incident) return { reply: 'Mode incident sudah mati ✅' }
      return { reply: '✅ All clear — mode incident dimatikan', action: 'all-clear' }

    case '/the-office':
    case '/theoffice':
      return { reply: 'Mode Dunder Mifflin diparkir — ketik /help untuk perintah yang aktif.' }

    default:
      return { reply: `Perintah tidak dikenal: ${cmd} — ketik /help untuk daftar perintah.` }
  }
}
