# Adaptasi Claude-Office → Olympus (Local Dev Team) — PLAN

**Base:** W17ant/Claude-Office v1.1.1, MIT, cloned 2026-10-16 to `~/workspace/claude-office-fork/`
**Keputusan capt 2026-10-16:** Adopsi full — kantor pixel-art + sprite dewa kita (8 dewa pixel-art). Pulau + lesehan + blob 3D PARKIR (mockup pulau tetap ada sebagai artifact, bukan dihapus).

## Apa yang dipakai apa adanya (jangan reinvent)
- React + TS + Vite frontend, Express + WS server, SQLite chat.
- Agent lifecycle: spawn → walk door → desk → working (typing) → coffee/water break → completed → walk door → removed (`src/agentManager.ts`).
- Sprite system: 4 arah per karakter (`<Base>-front-left/right, rear-left/right.png` di `public/sprites/characters/`), `ROLE_TO_CHAR` di `src/config.ts`.
- Chat panel Slack-style + routing (`src/components/SlackChat.tsx`), whiteboard task list (`TaskBoard.tsx`), inspector (`inspector.ts` + `Character.tsx` click), meters (`Meters.tsx`), incident (`incident.ts`), permissions (`PermissionCard.tsx`).
- Modes: `?sim` (simulasi), `?video`, `?helper`, live WS.

## Yang diganti / ditambah (Olympus)
1. **Karakter → 8 dewa (LOCKED):**
   - Zeus = Manager/Boss (ganti `boss` / `Me-1` → `Zeus-1`), Athena = Spec, Apollo = Design, Hephaestus = Frontend, Hades = Backend, Argus = QC, Ares = Security, Hermes = Release.
   - `ROLE_TO_CHAR` baru: boss→Zeus-1, manager→Zeus-1, spec→Athena-1, design→Apollo-1, frontend→Hephaestus-1, backend→Hades-1, qc→Argus-1, security→Ares-1, release→Hermes-1. Hapus mapping lama (debugger, etc.) atau map ke dewa terdekat.
   - Sprite: 8 dewa × 4 arah = 32 PNG. Template = `Helper.png`. Cara bikin: generate pixel-art per dewa via image gen dengan prompt "pixel art character, same style/layout as Helper.png, 4 directions" + aksesori dewa (mahkota+petir, owl, halo+lyre, palu+api, helm gelap+bident, banyak mata, armor+tombak, sayap+caduceus). Lalu extract jika perlu via `scripts/extract-boss-sprite.py` pattern.
   - `AGENT_CONFIGS` / warna / emoji per dewa: Zeus 👑⚡ ungu-slate, Athena 🦉 biru, Apollo ☀️ emas, Hephaestus 🔨 rust, Hades 💀 obsidian, Argus 👁️ teal, Ares ⚔️ merah, Hermes 🪽 hijau-teal.
2. **Routing chat → dewa:** `SlackChat` routing keyword → dewa (bug→Argus/Hades, UI→Hephaestus/Apollo, test→Argus, auth→Ares, deploy→Hermes, arsitektur→Athena/Zeus). Agent-to-agent messages (sudah ada `unread` + direct messages) → jadi Agora: semua pesan lewat panel, no DM rahasia, keputusan hanya Zeus.
3. **Gates (HARUS ditambah — Claude-Office tidak punya):** Gate 0.5 Brief Confirm, 1.6 UI Direction + Mockup, 1.75 Planning Approval, F Frontend Oke, S Sambungin, 5.5 Demo Preview, 6 Ship Gate (gas). Implementasi: panel Gates di atas office + `status.json` / WS event `gate_waiting` → office PAUSED + banner "NUNGGU APPROVAL LO — Gate X" + tombol Gas/Revisi/Stop (V1: approval via chat, dashboard = display + tombol tulis approval record).
4. **Agora panel:** ganti / tambah panel Agora (from→to + type badge tanya/info/minta-review/setuju/tolak/keputusan + body + time). Klik pesan → highlight 2 karakter di office + bubble di atas mereka.
5. **Adapter Muse (bukan Claude Code hooks):** Claude-Office pakai `hooks/` (Claude Code) + status line. Kita di Muse (subagent ephemeral, no hooks). Adapter: Zeus (Manager Muse) menulis `status.json` tiap state change (stage, agent, task, files, tickets, gate, agora) → server `server/` polling `status.json` / endpoint `POST /status` → broadcast WS ke frontend. Ini yang bikin dashboard LIVE di Muse. Tanpa adapter, office hanya jalan di `?sim`.
6. **Whiteboard = task list beneran:** `TaskBoard` sudah ada — isi dari `04-TASKS` / contract draft (Zeus tulis), bukan fake. Post-it To do → In progress → Done, pin merah kalau blocked (QC fail / gate waiting).
7. **Inspector:** klik dewa → card (task, tools, tokens, model, transcript, files, QC tickets). Sudah ada — isi dari status.json.
8. **Vercel Protection / auth:** V1 lokal dulu (127.0.0.1:3333). Deploy Vercel = V2 (perlu WS → polling fallback, karena Vercel serverless tidak pegang WS lama). Jangan klaim live Vercel sebelum adapter + polling jalan.

## Langkah (urut)
1. ✅ Clone + bedah struktur (selesai 2026-10-16).
2. Buat 8 sprite dewa pixel-art (32 PNG) — langkah berikutnya, butuh image gen + review capt.
3. `ROLE_TO_CHAR` + `AGENT_CONFIGS` + routing chat → dewa.
4. Adapter `status.json` → WS (server polling / POST endpoint).
5. Panel Gates + Agora + steering (Catatan/Sela/Stop + Grill-me).
6. Whiteboard dari tasks beneran + inspector dari status.json.
7. Test `?sim` → test live (Zeus tulis status.json → office update) → demo ke capt.

## Status implementasi (2026-10-18) — Batch Olympus
- ✅ **Nama dewa:** `AGENT_CONFIGS['assistant']` → Zeus · Manager; semua string `sender: 'Claude'` di `App.tsx` / `officeReducer.ts` → Zeus; `<title>` + title-bar → "Olympus — Dev Team Dashboard" / "OLYMPUS — DEV TEAM DASHBOARD". `CLAUDE_ID` / `CLAUDE_ROLE` tetap sebagai identifier internal (bukan string tampil). Test `officeReducer` / `inspector` yang assert nama lama ikut diupdate.
- ✅ **Suara:** `sounds.ts` tambah `resumeAudio()` + `isAudioUnlocked()` (AudioContext start suspended sampai gesture pertama — aturan autoplay browser). Banner "🔊 Klik untuk aktifin suara" tampil sampai interaksi pertama; klik → resume + ambient hum (tetap hormat `muted`).
- ✅ **Adapter (`server/olympus.js`, terpisah dari `POST /status` status-line):**
  - `POST /olympus/status` — body status Zeus `{ runId, stage, agent, task, files, tickets, gate, approval, agora }` → broadcast WS `{ type: 'status_update', olympus }`.
  - `POST /olympus/status` dengan `{ kind: 'gate_waiting', gate, docVersion }` → broadcast `{ type: 'gate_waiting', gateWaiting }`.
  - `POST /olympus/status` dengan `{ kind: 'agora_message', from, to, type, body, runId, stage }` → broadcast `{ type: 'agora_message', agoraMessage }`. Bare Agora message `{ from, to, type: 'minta-review', body }` juga diterima (envelope pakai `kind` karena `type` sudah dipakai Agora type).
  - `GET /olympus/status` → `{ ok, olympus, gates, agora }` (state in-memory).
  - Polling opsional: `OLYMPUS_STATUS_FILE` (default `<cwd>/status.json`) dibaca tiap 5 detik; perubahan → broadcast `status_update` (+ `gate_waiting` bila `gate.waiting` set, + `agora_message` baru). File tidak wajib; payload jelek = skip, tidak pernah crash.
  - Format `status.json` yang ditulis Zeus: `{ runId, stage, agent, task, files[], tickets[], gate, approval, agora[], gate?: { waiting, docVersion } }`.
  - Frontend: `handleEvent` di `App.tsx` menangani `status_update` / `gate_waiting` / `agora_message`. `?sim` tetap jalan tanpa server.
- ✅ **Panel Gates (`src/components/GatesPanel.tsx`):** 0.5 / 1.6 / 1.75 / F / S / 5.5 / 6, status locked/active/waiting/passed/revisi/stopped. `gate_waiting` → office PAUSED + banner "⏸️ NUNGGU APPROVAL LO — Gate X" + tombol Gas/Revisi/Stop. V1: tombol tulis approval record + toast "Approval tercatat — eksekusi via chat", TIDAK auto-deploy. Di `?sim`, Gate 0.5 jadi waiting 10 detik setelah load (demo).
- ✅ **Panel Agora (`src/components/AgoraPanel.tsx`):** list `{ from, to, type, body, runId, stage, time }`, badge type, `keputusan` tampil khusus (hanya Zeus). Klik pesan → inspect pengirim + bubble verbatim di atas karakternya. Seed 4 pesan (Hephaestus→Hades avatar_url, dst) agar panel tidak kosong di `?sim`. WS `agora_message` append ke list.

## Yang PARKIR (tidak dibangun sekarang)
- Pulau di Atas Awan + lesehan + blob 3D (mockup artifact + 05/06/07 pulau tetap tersimpan, bisa jadi V2 skin).
- Vercel deploy live (V2, perlu polling fallback).
- Dunder Mifflin mode (fan art, tidak dipakai).

## Lisensi
- Base MIT (W17ant). Fork ini tetap MIT, cantumkan NOTICE + link repo asli. Sprite dewa baru = karya kita (bukan copas sprite asli).
