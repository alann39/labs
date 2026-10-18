import type { RoomId } from './rooms'
import type { SessionStatus, AgentStatus, MeterTotals } from './meters'
import type { TaskBoardInfo } from './taskBoard'

export type AgentState =
  | 'idle'
  | 'walking-to-manager'
  | 'talking-to-manager'
  | 'walking-to-desk'
  | 'working'
  | 'coffee-break'
  | 'completed'
  | 'new-hire'
  | 'changing-room'
  | 'waiting'               // in the lobby by the door until a desk frees up

export interface Position {
  x: number
  y: number
}

export interface Agent {
  id: string
  name: string
  type: 'subagent' | 'mcp'
  role: string
  state: AgentState
  position: Position
  targetPosition: Position
  deskPosition: Position
  room: RoomId              // which room the agent is currently in
  assignedRoom: RoomId      // where their desk is
  assignedSpotId?: string   // which spot they're assigned to
  task?: string
  statusText?: string
  spriteFacing?: 'front-left' | 'front-right' | 'rear-left' | 'rear-right'
  color: string
  emoji: string
  hiredAt: number
  pathQueue?: { x: number; y: number }[]  // waypoints to walk through
  unread?: number           // directed agent-to-agent messages not yet read
  sessionId?: string        // the Claude Code session (terminal) this agent works for
  project?: string          // that session's project (basename of its cwd)
  lastFailed?: boolean      // the last agent_working for this agent was a tool failure
  // The per-session Claude (id `main-<sessionId>`) only: what its main thread is doing
  mainState?: MainState     // undefined = not heard from yet
  needsYou?: NeedsYou       // set while mainState is 'needs-you'
  waitingOn?: number        // background workers a finished turn still waits for
  model?: string            // the session's model (session_model / session_started)
  scene?: AgentScene        // a signal's scene on the character that ran the command
}

/**
 * What a Bash command meant: hooks/agent-tracker.sh classifies the commands
 * that deploy, build, test or push ("Signals") and the server broadcasts
 * one `signal` event per signal, right after the event that carried it.
 */
export type SignalKind =
  | 'deploy_start' | 'deploy_success' | 'deploy_fail'
  | 'build_start' | 'build_ok' | 'build_failed'
  | 'test_start' | 'test_ok' | 'test_failed'
  | 'push' | 'push_done' | 'push_failed'

/** The server's `signal` broadcast (also the snapshot's `signals` entries and GET /signals) */
export interface SignalEvent {
  type: 'signal'
  kind: SignalKind
  /** What it was about: the app, package or directory, else the project */
  target?: string
  /** "3 failing", "2 errors" */
  detail?: string
  /** The first meaningful line of a failure's output */
  error?: string
  exitCode?: number
  /** A push: the branch, and whether it is main / master */
  branch?: string
  toDefault?: boolean
  /** The run was stopped (Esc), not failed */
  interrupted?: boolean
  sessionId?: string
  project?: string
  /** The office worker that ran it (absent on the main thread) */
  agentId?: string
  agentName?: string
  at?: number
  seq?: number
  timestamp?: number
}

/**
 * A scene a signal puts on the character that ran the command: a deploy
 * shipping (until it lands or 10 min pass), a deploy that landed, a red run,
 * a push to main. `until` is when it ends by itself.
 */
export interface AgentScene {
  kind: 'shipping' | 'shipped' | 'red' | 'pushed'
  until: number
  label?: string
}

/** What a session's main thread (its Claude) is doing — the server's `main.state` */
export type MainState = 'working' | 'waiting' | 'idle' | 'needs-you' | 'error' | 'compacting'

/** `registry`: an unhooked session whose registry status is "waiting" (a dialog or question in its terminal) */
export type NeedsYouKind = 'permission' | 'idle' | 'quota' | 'agent-input' | 'registry'

/** Why a session is waiting on a person (session_needs_you / main.needsYou) */
export interface NeedsYou {
  kind: NeedsYouKind
  toolName?: string
  summary?: string
  message?: string
  notificationType?: string
  promptId?: string
  since?: number
}

/**
 * The server's per-session main-thread record. Travels as `main` on the WS
 * snapshot's sessions, GET /sessions and every session_* broadcast. Text
 * fields are '' when the server's `logPrompts` setting is off.
 */
export interface SessionMain {
  state: MainState
  since?: number
  lastPrompt?: string
  lastPromptAt?: number
  lastReply?: string
  lastReplyAt?: number
  waitingOn?: number
  crons?: number
  needsYou?: NeedsYou
  error?: { error: string; detail?: string; since?: number }
  promptId?: string
}

/**
 * A Claude Code PermissionUpdate the dialog suggested (setMode, addRules,
 * addDirectories, ...). Passed through as the server sent it, so "allow and
 * remember" can echo it back verbatim; src/permissions.ts only reads it.
 */
export type PermissionSuggestion = Record<string, unknown>

/**
 * A permission dialog waiting on the office (server/permissions.js): what
 * `permission_request` carries and the WS snapshot lists as pendingPermissions.
 */
export interface PendingPermission {
  id: string
  sessionId: string
  project?: string
  cwd?: string
  sessionTitle?: string
  toolName: string
  summary: string
  /** The Bash command, the file path, or the tool input as compact JSON (≤ 400 chars) */
  detail: string
  suggestions: PermissionSuggestion[]
  permissionMode: string
  promptId?: string
  agentId?: string
  createdAt: number
  /** When the server hands the dialog back to the terminal (extended once the session is known interactive) */
  deadline: number
  status: 'pending' | 'allowed' | 'denied' | 'resolved_elsewhere' | 'expired'
  interactive?: boolean
}

/** One entry of session_turn_end.backgroundTasks (a Stop hook's background_tasks item) */
export interface BackgroundTask {
  id: string
  type: string
  status: string
  description?: string
  /** The office worker this task is, when the server knows it */
  officeId?: string
}

/**
 * A Claude Code session the office knows about — one per terminal. Mirrors
 * the server's GET /sessions entries and session_started/session_ended events.
 */
export interface SessionInfo {
  id: string
  project?: string
  cwd?: string
  title?: string
  model?: string
  source?: string           // startup | resume | compact | clear | fork | implicit
  state: 'active' | 'ended'
  reason?: string           // why it ended
  startedAt?: number
  lastActivityAt?: number
  /** Last main-thread tool status (agent_working with no agentId) and when */
  lastStatus?: string
  lastStatusAt?: number
  /** The server's main-thread record, once it sends one */
  main?: SessionMain
  /**
   * false: known only from Claude Code's session registry (no hook has
   * reported yet — the strip shows it tinted "not hooked", the office seats
   * no Claude for it); true or absent: the hooks report it.
   */
  hooked?: boolean
  /** Its entry in Claude Code's session registry, while its process runs */
  registry?: SessionRegistry
}

/**
 * What the server keeps of a ~/.claude/sessions/<pid>.json entry (server/
 * sessions.js): presence and status only. `status` is Claude Code's own word
 * (busy | shell | idle | waiting); `name` is the registry display name
 * ("office-7f" derived from the cwd, or what --name / /rename set).
 */
export interface SessionRegistry {
  pid: number
  name?: string
  nameSource?: string
  status?: string
  kind?: string
  version?: string
  startedAt?: number
  statusUpdatedAt?: number
}

/**
 * One entry of the server's `snapshot` message (its activeAgents record).
 * MCP calls are tracked as transient records with a `server` field; they are
 * not office workers.
 */
export interface SnapshotAgent {
  id: string
  name?: string
  role?: string
  task?: string
  state?: string
  status?: string
  unread?: number
  sessionId?: string
  project?: string
  server?: string
}

/**
 * The server's pipeline health: GET /health, the snapshot's `health` and the
 * `health` broadcast (server/health.js). What the status strip shows.
 */
export interface ServerHealth {
  status: string
  agents: number
  clients: number
  sessions: number
  /** When a Claude Code hook last reached POST /event (ms epoch), null if never since boot */
  lastHookAt: number | null
  /** Hook events accepted since the server started */
  hooksSeen: number
  /** The built UI (dist/) is served from the server's root */
  uiAvailable: boolean
  version: string
  uptimeMs: number
}

export interface OfficeEvent {
  type: 'agent_spawned' | 'agent_working' | 'agent_completed' | 'mcp_call' | 'mcp_done' | 'new_hire' | 'chat_message' | 'chat_typing' | 'chat_reaction' | 'chat_seen' | 'inbox_update' | 'variant_change' | 'session_started' | 'session_ended' | 'session_status' | 'agent_status' | 'snapshot'
    // The turn events (UserPromptSubmit, Stop, PermissionRequest/Notification, StopFailure, Pre/PostCompact, CwdChanged, PostModelSwitch),
    // session_main (a server-side change: a hand lowered by a tool result or the timeout) and
    // session_tool_done (main-thread PostToolUse / PostToolBatch, the input that lowers a hand)
    | 'session_prompt' | 'session_turn_end' | 'session_needs_you' | 'session_error' | 'session_compact' | 'session_cwd' | 'session_model'
    | 'session_main' | 'session_tool_done'
    // session_registry: the session's registry entry changed (status, name, attached, gone) — the full session record
    | 'session_registry'
    // A permission dialog waiting on the office, its deadline moving, and its end (src/permissions.ts)
    | 'permission_request' | 'permission_extended' | 'permission_resolved'
    // Pipeline health (the status strip): the server's record, and the socket's own open/close
    | 'health' | 'connection'
    // A session's task list changed (server/tasks.js), or the snapshot's boards (src/taskBoard.ts)
    | 'task_board'
    // Olympus (local-dev-team): Zeus's status.json adapter + gates + Agora
    | 'status_update' | 'gate_waiting' | 'agora_message'
  agent?: Partial<Agent>
  agentId?: string
  status?: string
  result?: string
  // agent_completed: what the Agent tool reported for a foreground subagent
  tokens?: number
  durationMs?: number
  toolUses?: number
  // snapshot: every agent the server knows about (sent on each (re)connect), and the sessions
  activeAgents?: SnapshotAgent[]
  sessions?: SessionInfo[]
  // snapshot: the permission dialogs waiting on the office, and the token that answers them
  pendingPermissions?: PendingPermission[]
  uiToken?: string
  // permission_request / permission_extended / permission_resolved
  permission?: PendingPermission
  permissionId?: string
  deadline?: number
  decidedBy?: 'office' | 'terminal' | 'timeout'
  // Every session_* broadcast carries the session's main-thread record
  main?: SessionMain
  promptId?: string
  // session_prompt / session_turn_end (their `text` ≤ 2000 is the shared field below, '' when logPrompts is off)
  isWakeup?: boolean
  wakeupAgentId?: string      // the subagent id in the wake-up prompt
  wakeupOfficeId?: string     // that worker's office id, when the server knows it
  wakeupStatus?: string
  backgroundTasks?: BackgroundTask[]
  crons?: number | unknown[]
  stopHookActive?: boolean
  // session_needs_you
  kind?: NeedsYouKind
  toolName?: string
  summary?: string
  message?: string
  notificationType?: string
  needsYou?: NeedsYou
  // session_tool_done
  batch?: boolean
  count?: number
  // session_error
  error?: string
  detail?: string
  // session_compact
  phase?: 'pre' | 'post'
  trigger?: string
  // session_cwd / session_model
  oldCwd?: string
  fromModel?: string
  switchSource?: string
  // chat_message: the server's row id (chat_reaction / chat_seen refer to it)
  id?: number
  isSystem?: boolean
  role?: string
  // chat_reaction / chat_seen
  messageId?: number
  reactions?: string[]
  // mcp_call
  server?: string
  tool?: string
  // The Claude Code session the event came from (every hook event carries it)
  sessionId?: string
  project?: string
  // session_started / session_ended / session_registry
  cwd?: string
  source?: string
  model?: string
  title?: string
  state?: 'active' | 'ended'
  startedAt?: number
  lastActivityAt?: number
  lastStatus?: string
  lastStatusAt?: number
  // false while only Claude Code's session registry knows the session (no hook has reported)
  hooked?: boolean
  // the session's registry entry; absent once its process has gone
  registry?: SessionRegistry
  timestamp?: number
  // session_status / agent_status: the payroll / electricity / memory feed (src/meters.ts)
  session?: SessionStatus
  statuses?: SessionStatus[]
  totals?: MeterTotals
  removed?: boolean
  agents?: AgentStatus[]
  sender?: string
  text?: string
  // Directed agent-to-agent chat messages
  recipient?: string | null
  recipientId?: string | null
  senderId?: string | null
  msg_type?: string | null
  // inbox_update
  unread?: number
  // agent_working: the tool call errored (PostToolUseFailure)
  failed?: boolean
  // variant_change: the server relayed /incident or /all-clear to every client
  // (reason is also why a session_ended session ended)
  variant?: 'none' | 'incident'
  reason?: string
  // health: the server's pipeline record (server/health.js), also carried by the snapshot
  health?: ServerHealth
  // task_board: one session's board (null: no tasks, or the session ended), or
  // every board at once (`boards`, from the snapshot)
  board?: TaskBoardInfo | null
  boards?: TaskBoardInfo[]
  // connection: the WebSocket opened or closed — dispatched by useAgentSocket, not sent by the server
  socket?: 'open' | 'closed'
  // Olympus: Zeus's run status (server/olympus.js), a gate waiting on the
  // owner, and one Agora message — see the interfaces below
  olympus?: OlympusStatus
  gateWaiting?: { gate: string; docVersion?: string }
  agoraMessage?: AgoraMessage
}

/**
 * Olympus run status — what Zeus (Manager, Muse) writes to `status.json`
 * on every state change. POSTed to /olympus/status or picked up by the
 * server polling status.json, then broadcast as `status_update`.
 */
export interface OlympusStatus {
  runId?: string
  stage?: string
  agent?: string
  task?: string
  files?: string[]
  tickets?: string[]
  gate?: string
  approval?: string
  agora?: AgoraMessage[]
}

/** One Agora message — the only way gods talk to each other. No DMs. */
export interface AgoraMessage {
  from: string
  to: string
  type: 'tanya' | 'info' | 'minta-review' | 'setuju' | 'tolak' | 'keputusan'
  body: string
  runId?: string
  stage?: string
  time?: string
}

/** A workflow gate: a HARD stop until the owner decides. */
export type GateStatus = 'locked' | 'active' | 'waiting' | 'passed' | 'revisi' | 'stopped'

export interface GateInfo {
  id: string
  label: string
  mode: 'A' | 'B' | 'A/B'
  status: GateStatus
  /** The approval record for this gate, once decided (V1: recorded, executed via chat) */
  decision?: { choice: 'Gas' | 'Revisi' | 'Stop'; at: string; docVersion?: string }
}

import { BOSS_CONFIG } from './config'

export const AGENT_CONFIGS: Record<string, { color: string; emoji: string; title: string }> = {
  // The boss — configured via office.config.json. The object itself, not a
  // copy: loadRuntimeConfig (src/config.ts) updates it in place.
  'boss':                  BOSS_CONFIG,
  // OLYMPUS gods (primary)
  'manager':               { color: '#4A3B6B', emoji: '⚡', title: 'Zeus · Manager' },
  'zeus':                  { color: '#4A3B6B', emoji: '⚡', title: 'Zeus · Manager' },
  'spec':                  { color: '#2F5D8A', emoji: '🦉', title: 'Athena · Spec' },
  'athena':                { color: '#2F5D8A', emoji: '🦉', title: 'Athena · Spec' },
  'design':                { color: '#C98A1B', emoji: '☀️', title: 'Apollo · Design' },
  'apollo':                { color: '#C98A1B', emoji: '☀️', title: 'Apollo · Design' },
  'frontend':              { color: '#8A3B1B', emoji: '🔨', title: 'Hephaestus · Frontend' },
  'hephaestus':            { color: '#8A3B1B', emoji: '🔨', title: 'Hephaestus · Frontend' },
  'backend':               { color: '#1A1A22', emoji: '💀', title: 'Hades · Backend' },
  'hades':                 { color: '#1A1A22', emoji: '💀', title: 'Hades · Backend' },
  'qc':                    { color: '#1F6B5A', emoji: '👁️', title: 'Argus · QC' },
  'argus':                 { color: '#1F6B5A', emoji: '👁️', title: 'Argus · QC' },
  'security':              { color: '#8A1B1B', emoji: '⚔️', title: 'Ares · Security' },
  'ares':                  { color: '#8A1B1B', emoji: '⚔️', title: 'Ares · Security' },
  'release':               { color: '#1B7A6B', emoji: '🪽', title: 'Hermes · Release' },
  'hermes':                { color: '#1B7A6B', emoji: '🪽', title: 'Hermes · Release' },
  // Legacy aliases → nearest god
  'debugger':              { color: '#1F6B5A', emoji: '👁️', title: 'Argus · QC' },
  'code-reviewer':         { color: '#2F5D8A', emoji: '🦉', title: 'Athena · Spec' },
  'frontend-developer':    { color: '#8A3B1B', emoji: '🔨', title: 'Hephaestus · Frontend' },
  'fullstack-developer':   { color: '#1A1A22', emoji: '💀', title: 'Hades · Backend' },
  'test-engineer':         { color: '#1F6B5A', emoji: '👁️', title: 'Argus · QC' },
  'security-auditor':      { color: '#8A1B1B', emoji: '⚔️', title: 'Ares · Security' },
  'architect-reviewer':    { color: '#2F5D8A', emoji: '🦉', title: 'Athena · Spec' },
  'performance-engineer':  { color: '#1A1A22', emoji: '💀', title: 'Hades · Backend' },
  'devops-engineer':       { color: '#1B7A6B', emoji: '🪽', title: 'Hermes · Release' },
  'database-architect':    { color: '#1A1A22', emoji: '💀', title: 'Hades · Backend' },
  'typescript-pro':        { color: '#8A3B1B', emoji: '🔨', title: 'Hephaestus · Frontend' },
  'ai-engineer':           { color: '#2F5D8A', emoji: '🦉', title: 'Athena · Spec' },
  'prompt-engineer':       { color: '#C98A1B', emoji: '☀️', title: 'Apollo · Design' },
  'general-purpose':       { color: '#1B7A6B', emoji: '🪽', title: 'Hermes · Release' },
  'Explore':               { color: '#1F6B5A', emoji: '👁️', title: 'Argus · QC' },
  // MCPs
  'github':                { color: '#f0f0f0', emoji: '🐙', title: 'GitHub' },
  'supabase':              { color: '#3ecf8e', emoji: '⚡', title: 'Supabase' },
  'playwright':            { color: '#45ba4b', emoji: '🎭', title: 'Playwright' },
  'chrome':                { color: '#4285f4', emoji: '🌐', title: 'Chrome' },
  'memory':                { color: '#ff9800', emoji: '🧠', title: 'Memory' },
  'seo':                   { color: '#4caf50', emoji: '📊', title: 'SEO' },
  'gmail':                 { color: '#ea4335', emoji: '📧', title: 'Gmail' },
  'ios-simulator':         { color: '#a2aaad', emoji: '📱', title: 'iOS' },
  'assistant':             { color: '#4A3B6B', emoji: '⚡', title: 'Zeus · Manager' },
  'default':               { color: '#95a5a6', emoji: '👤', title: 'Worker' },
}
