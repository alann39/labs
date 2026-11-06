import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addDays, namaBulan, nextMonthKey } from "./format";
import { seed } from "./seed";

/* ================= Model =================
   Satu-satunya jalan dana masuk (selain isi ulang awal bulan dari closing)
   adalah tahap "pengisian kembali" di dalam Proses LPJ. Karena itu dana
   masuk selalu tertaut ke LPJ yang dimaksud. */

export type Stage = "pengajuan" | "pemeriksaan" | "disetujui" | "pengisian" | "selesai";
export const STAGE_ORDER: Stage[] = ["pengajuan", "pemeriksaan", "disetujui", "pengisian", "selesai"];
export const STAGE_LABEL: Record<Stage, string> = {
  pengajuan: "Pengajuan dibuat",
  pemeriksaan: "Pemeriksaan dan persetujuan",
  disetujui: "Disetujui, menunggu pengisian",
  pengisian: "Pengisian kembali",
  selesai: "Selesai",
};
/** Aksi untuk maju dari stage saat ini */
export const STAGE_ACTION: Partial<Record<Stage, string>> = {
  pengajuan: "Periksa",
  pemeriksaan: "Setujui",
  disetujui: "Isi kembali",
  pengisian: "Selesaikan",
};

export interface Proses {
  id: string;
  no: string;
  vaId: string;
  tanggal: string; // ISO yyyy-mm-dd (pengajuan)
  nominal: number;
  keterangan: string;
  stage: Stage;
  tanggalIsi?: string; // terisi saat masuk tahap pengisian
  lampiran?: string[];
}

export interface VA {
  id: string;
  nama: string;
  nomor: string;
  grup: string;
  saldoNormal: number;
  sisaBank: number;
  sisaDiinput: boolean;
  konfirmasiClosing: boolean; // VA tanpa proses yang sudah dikonfirmasi closing manual
}

export interface MonthData {
  key: string; // "2026-10"
  vas: VA[];
  proses: Proses[];
  ditutup: boolean;
}

export interface AppState {
  months: MonthData[];
  activeMonth: string;
}

/* ================= Seed =================
   Seed Oktober 2026 tinggal di ./seed (dipakai bersama oleh API server
   untuk men-seed database dan oleh store sebagai placeholder lokal). */

/* ================= Hitungan ================= */

export interface VaStats {
  lpj: number;       // total LPJ disetujui (stage >= disetujui)
  isiKembali: number;
  masuk: number;     // saldo normal (isi ulang awal) + isi kembali
  dk: number;        // dana dikembalikan
  pending: number;   // proses yang belum selesai alurnya
}

export function vaStats(m: MonthData, va: VA): VaStats {
  let lpj = 0, isi = 0, pending = 0;
  for (const p of m.proses) {
    if (p.vaId !== va.id) continue;
    if (p.stage === "disetujui" || p.stage === "pengisian" || p.stage === "selesai") lpj += p.nominal;
    if (p.stage === "pengisian" || p.stage === "selesai") isi += p.nominal;
    if (p.stage !== "selesai") pending += 1;
  }
  const masuk = va.saldoNormal + isi;
  return { lpj, isiKembali: isi, masuk, dk: masuk - lpj - va.sisaBank, pending };
}

export type VaStatus = "closing" | "proses" | "kurang";
export function vaStatus(m: MonthData, va: VA): VaStatus {
  const s = vaStats(m, va);
  if (s.dk < 0) return "kurang";
  if (m.ditutup) return "closing";
  const siap = va.sisaDiinput && s.pending === 0 && (m.proses.some((p) => p.vaId === va.id) || va.konfirmasiClosing);
  return siap ? "closing" : "proses";
}

export interface Totals {
  normal: number; masuk: number; lpj: number; sisa: number; dkPositif: number; vaKurang: VA[];
}
export function monthTotals(m: MonthData): Totals {
  let normal = 0, masuk = 0, lpj = 0, sisa = 0, dkPositif = 0;
  const vaKurang: VA[] = [];
  for (const va of m.vas) {
    const s = vaStats(m, va);
    normal += va.saldoNormal; masuk += s.masuk; lpj += s.lpj; sisa += va.sisaBank;
    if (s.dk > 0) dkPositif += s.dk;
    if (s.dk < 0) vaKurang.push(va);
  }
  return { normal, masuk, lpj, sisa, dkPositif, vaKurang };
}

/* ================= Store ================= */

export type SyncState = "idle" | "saving" | "error";

interface Store {
  state: AppState;
  month: MonthData;
  loading: boolean;
  offline: boolean;
  syncState: SyncState;
  hasSaved: boolean;
  setActiveMonth: (key: string) => void;
  addProses: (p: Omit<Proses, "id" | "no" | "stage">) => Proses;
  advanceProses: (prosesId: string) => void;
  setSisaBank: (vaId: string, nilai: number) => void;
  tutupBulan: () => void;
  reset: () => void;
  nextNo: () => string;
}

const Ctx = createContext<Store | null>(null);

interface StatePayload extends AppState {
  versions: Record<string, number>;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  // Placeholder lokal sampai GET /api/state pertama selesai; UI menampilkan
  // layar loading selama itu (lihat bagian bawah provider).
  const [state, setState] = useState<AppState>(() => seed());
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [hasSaved, setHasSaved] = useState(false);

  const versionsRef = useRef<Record<string, number>>({});
  const syncedRef = useRef<Map<string, MonthData>>(new Map());
  const syncedActiveRef = useRef<string | null>(null);
  const loadedRef = useRef(false);

  const adoptServerState = (payload: StatePayload) => {
    versionsRef.current = payload.versions ?? {};
    syncedRef.current = new Map(payload.months.map((m) => [m.key, m]));
    syncedActiveRef.current = payload.activeMonth;
    setState({ months: payload.months, activeMonth: payload.activeMonth });
  };

  // Muat awal dari server; gagal -> tetap di seed lokal + mode offline.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/state");
        if (!res.ok) throw new Error("state-gagal");
        const payload = (await res.json()) as StatePayload;
        if (cancelled) return;
        if (Array.isArray(payload.months) && payload.months.length > 0) {
          adoptServerState(payload);
        }
      } catch {
        if (!cancelled) setOffline(true);
      } finally {
        if (!cancelled) {
          loadedRef.current = true;
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sinkronisasi perubahan lokal ke server (debounce 500ms).
  useEffect(() => {
    if (!loadedRef.current || loading) return;
    const changed = state.months.filter((m) => syncedRef.current.get(m.key) !== m);
    const activeChanged = syncedActiveRef.current !== null && syncedActiveRef.current !== state.activeMonth;
    if (changed.length === 0 && !activeChanged) return;

    const timer = setTimeout(async () => {
      setSyncState("saving");
      try {
        for (const m of changed) {
          const version = versionsRef.current[m.key];
          if (version === undefined) {
            const res = await fetch("/api/months", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ data: m }),
            });
            if (res.status === 409) throw new Error("version-conflict");
            if (!res.ok) throw new Error("sync-gagal");
            const out = (await res.json()) as { version: number };
            versionsRef.current[m.key] = out.version;
          } else {
            const res = await fetch(`/api/months/${encodeURIComponent(m.key)}`, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ data: m, version }),
            });
            if (res.status === 409) throw new Error("version-conflict");
            if (!res.ok) throw new Error("sync-gagal");
            const out = (await res.json()) as { version: number };
            versionsRef.current[m.key] = out.version;
          }
          syncedRef.current.set(m.key, m);
        }
        if (activeChanged) {
          const res = await fetch("/api/active", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ key: state.activeMonth }),
          });
          if (!res.ok) throw new Error("sync-gagal");
          syncedActiveRef.current = state.activeMonth;
        }
        setOffline(false);
        setSyncState("idle");
        setHasSaved(true);
      } catch (err) {
        if (err instanceof Error && err.message === "version-conflict") {
          // Server menang: ambil ulang state dan ganti lokal tanpa drama.
          try {
            const res = await fetch("/api/state");
            if (res.ok) {
              const payload = (await res.json()) as StatePayload;
              if (Array.isArray(payload.months) && payload.months.length > 0) adoptServerState(payload);
            }
          } catch { /* abaikan, status error di bawah tetap berlaku */ }
          setSyncState("error");
        } else {
          setOffline(true);
          setSyncState("error");
        }
      }
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, loading]);

  const month = useMemo(
    () => state.months.find((m) => m.key === state.activeMonth) ?? state.months[state.months.length - 1],
    [state],
  );

  const patchMonth = (fn: (m: MonthData) => MonthData) =>
    setState((s) => ({ ...s, months: s.months.map((m) => (m.key === s.activeMonth ? fn(m) : m)) }));

  const store: Store = {
    state,
    month,
    loading,
    offline,
    syncState,
    hasSaved,
    setActiveMonth: (key) => setState((s) => ({ ...s, activeMonth: key })),
    nextNo: () => {
      const nums = month.proses.map((p) => parseInt(p.no.replace(/\D/g, "").slice(-4), 10)).filter((n) => !Number.isNaN(n));
      const next = (nums.length ? Math.max(...nums) : 1029) + 1;
      return `LPJ-${month.key.slice(0, 4)}-${next}`;
    },
    addProses: (p) => {
      const full: Proses = { ...p, id: `u${Date.now()}`, no: store.nextNo(), stage: "pengajuan" };
      patchMonth((m) => ({ ...m, proses: [...m.proses, full] }));
      return full;
    },
    advanceProses: (prosesId) =>
      patchMonth((m) => ({
        ...m,
        proses: m.proses.map((p) => {
          if (p.id !== prosesId) return p;
          const idx = STAGE_ORDER.indexOf(p.stage);
          if (idx >= STAGE_ORDER.length - 1) return p;
          const stage = STAGE_ORDER[idx + 1];
          return { ...p, stage, tanggalIsi: stage === "pengisian" ? addDays(p.tanggal, 2) : p.tanggalIsi };
        }),
      })),
    setSisaBank: (vaId, nilai) =>
      patchMonth((m) => ({ ...m, vas: m.vas.map((v) => (v.id === vaId ? { ...v, sisaBank: nilai, sisaDiinput: true } : v)) })),
    tutupBulan: () => {
      const nk = nextMonthKey(month.key);
      const fresh: MonthData = {
        key: nk,
        vas: month.vas.map((v) => ({ ...v, sisaBank: 0, sisaDiinput: false, konfirmasiClosing: false })),
        proses: [],
        ditutup: false,
      };
      setState((s) => ({
        months: [...s.months.map((m) => (m.key === s.activeMonth ? { ...m, ditutup: true } : m)), fresh],
        activeMonth: nk,
      }));
    },
    reset: () => {
      void (async () => {
        try {
          const res = await fetch("/api/reset", { method: "POST" });
          if (!res.ok) throw new Error("reset-gagal");
          const payload = (await res.json()) as StatePayload;
          if (!Array.isArray(payload.months) || payload.months.length === 0) throw new Error("reset-gagal");
          adoptServerState(payload);
          setOffline(false);
        } catch {
          setState(seed());
        }
      })();
    },
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "var(--surface-muted)",
          color: "var(--text-secondary)",
          fontSize: 14,
        }}
        role="status"
      >
        Memuat data…
      </div>
    );
  }

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore di luar StoreProvider");
  return s;
}

export { namaBulan };
