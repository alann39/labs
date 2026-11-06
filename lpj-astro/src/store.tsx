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
  // Cermin state terbaru untuk runner sinkronisasi: diff selalu dihitung
  // dari state saat run mulai, bukan snapshot saat timer dijadwalkan.
  const stateRef = useRef(state);
  // Penjaga single-flight: selama true, runSync() tambahan langsung kembali
  // dan run yang aktif menjemput perubahan terbaru di iterasi berikutnya.
  const syncRunningRef = useRef(false);
  // True begitu app benar-benar pernah melihat state server di sesi ini
  // (muat awal berhasil / setiap adoptServerState, termasuk reset).
  // Menentukan perilaku saat 409: dengan baseline, rebase-retry lokal
  // menang itu aman; tanpa baseline, state lokal hanyalah seed placeholder
  // offline dan TIDAK boleh menimpa data server asli (lihat guard di
  // syncMonth).
  const hasBaselineRef = useRef(false);

  const adoptServerState = (payload: StatePayload) => {
    // Mengadopsi payload berarti app sudah melihat state server asli —
    // catat sebagai baseline sesi ini.
    hasBaselineRef.current = true;
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

  // Jaga stateRef selalu menunjuk state terbaru (untuk runner di bawah).
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const fetchStatePayload = async (): Promise<StatePayload> => {
    const res = await fetch("/api/state");
    if (!res.ok) throw new Error("sync-gagal");
    const payload = (await res.json()) as StatePayload;
    if (!Array.isArray(payload.months) || payload.months.length === 0) throw new Error("sync-gagal");
    return payload;
  };

  const putMonth = (m: MonthData, version: number) =>
    fetch(`/api/months/${encodeURIComponent(m.key)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: m, version }),
    });

  const postMonth = (m: MonthData) =>
    fetch("/api/months", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: m }),
    });

  /**
   * Sinkronkan satu bulan ke server.
   * 409 -> rebase sekali: GET /api/state hanya untuk menyegarkan
   * versionsRef, lalu retry dengan objek lokal TERBARU dan version segar
   * (lokal menang — app single-user, konflik nyaris selalu self-overlap,
   * bukan penulis kedua). Baseline bulan lain sengaja tidak disentuh:
   * syncedRef hanya berubah saat bulan itu sendiri berhasil tersimpan,
   * jadi bulan bersih tidak ikut tertulis ulang.
   * 409 tanpa baseline (muat awal gagal; lokal masih seed placeholder
   * offline) -> lempar "no-baseline": runner mengadopsi state server,
   * karena placeholder tidak boleh menimpa data server asli.
   * 409 kedua -> lempar "version-conflict" (runner jatuh ke
   * adoptServerState sebagai jalan terakhir). Error jaringan/status lain
   * -> lempar "sync-gagal" / TypeError dari fetch.
   */
  const syncMonth = async (m: MonthData): Promise<void> => {
    const version = versionsRef.current[m.key];
    if (version === undefined) {
      const res = await postMonth(m);
      if (res.ok) {
        const out = (await res.json()) as { version: number };
        versionsRef.current[m.key] = out.version;
        syncedRef.current.set(m.key, m);
        return;
      }
      if (res.status !== 409) throw new Error("sync-gagal");
    } else {
      const res = await putMonth(m, version);
      if (res.ok) {
        const out = (await res.json()) as { version: number };
        versionsRef.current[m.key] = out.version;
        syncedRef.current.set(m.key, m);
        return;
      }
      if (res.status !== 409) throw new Error("sync-gagal");
    }

    if (!hasBaselineRef.current) {
      // Corner tanpa baseline: muat awal gagal dan state lokal masih seed
      // placeholder offline (banner offline sedang tampil), sementara
      // server memegang data asli yang konflik dengan POST/PUT di atas.
      // Rebase-retry lokal-menang di sini akan menimpa data asli server
      // dengan placeholder, jadi JANGAN retry — lempar sinyal khusus agar
      // runner mengadopsi state server. Edit yang dibuat di atas
      // placeholder hilang BY DESIGN di corner ini (user sudah melihat
      // banner offline); melindungi data server lebih penting.
      throw new Error("no-baseline");
    }

    // --- Rebase: segarkan version dari server, retry lokal terbaru. ---
    const payload = await fetchStatePayload();
    versionsRef.current = payload.versions ?? {};
    const localNow = stateRef.current.months.find((x) => x.key === m.key) ?? m;
    const serverNow = payload.months.find((x) => x.key === m.key);
    if (serverNow && JSON.stringify(serverNow) === JSON.stringify(localNow)) {
      // Server ternyata sudah memegang konten yang sama (mis. POST pertama
      // sebenarnya berhasil tapi responsnya hilang) — samakan baseline saja.
      syncedRef.current.set(m.key, localNow);
      return;
    }
    const freshVersion = versionsRef.current[m.key];
    if (freshVersion === undefined) {
      const res = await postMonth(localNow);
      if (!res.ok) throw new Error(res.status === 409 ? "version-conflict" : "sync-gagal");
      const out = (await res.json()) as { version: number };
      versionsRef.current[m.key] = out.version;
      syncedRef.current.set(m.key, localNow);
      return;
    }
    const res = await putMonth(localNow, freshVersion);
    if (res.ok) {
      const out = (await res.json()) as { version: number };
      versionsRef.current[m.key] = out.version;
      syncedRef.current.set(m.key, localNow);
      return;
    }
    throw new Error(res.status === 409 ? "version-conflict" : "sync-gagal");
  };

  /**
   * Runner sinkronisasi single-flight. Selama satu run aktif, panggilan
   * berikutnya langsung kembali; run yang aktif mengulang diff dari state
   * TERBARU (stateRef) sampai lokal == server, jadi perubahan yang datang
   * di tengah run tidak pernah menembak PUT paralel dengan version basi
   * dan tidak ada perubahan yang terbuang diam-diam.
   * Kegagalan jaringan menghentikan run (tanpa retry loop); perubahan
   * berikutnya menjadwalkan percobaan baru lewat effect penjadwal.
   */
  const runSync = async (): Promise<void> => {
    if (syncRunningRef.current) return;
    syncRunningRef.current = true;
    setSyncState("saving");
    try {
      for (;;) {
        const latest = stateRef.current;
        const changed = latest.months.filter((m) => syncedRef.current.get(m.key) !== m);
        const activeChanged =
          syncedActiveRef.current !== null && syncedActiveRef.current !== latest.activeMonth;
        if (changed.length === 0 && !activeChanged) break;
        try {
          for (const m of changed) {
            await syncMonth(m);
          }
          if (activeChanged) {
            const res = await fetch("/api/active", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ key: latest.activeMonth }),
            });
            if (!res.ok) throw new Error("sync-gagal");
            syncedActiveRef.current = latest.activeMonth;
          }
        } catch (err) {
          if (err instanceof Error && err.message === "no-baseline") {
            // Corner tanpa baseline (lihat guard di syncMonth): jangan
            // menangkan placeholder offline — adopsi state server sebagai
            // satu-satunya data asli dan akhiri run dengan bersih.
            // adoptServerState men-set hasBaselineRef, jadi sinkronisasi
            // berikutnya berjalan normal.
            try {
              adoptServerState(await fetchStatePayload());
              setOffline(false);
              setSyncState("idle");
            } catch {
              setOffline(true);
              setSyncState("error");
            }
            return;
          }
          if (err instanceof Error && err.message === "version-conflict") {
            // Jalan terakhir: rebase-retry pun konflik — penulis lain asli.
            // Server menang: ambil ulang state dan ganti lokal tanpa drama.
            try {
              adoptServerState(await fetchStatePayload());
            } catch { /* abaikan, status error di bawah tetap berlaku */ }
            setSyncState("error");
          } else {
            setOffline(true);
            setSyncState("error");
          }
          return;
        }
      }
      // Hanya tercapai saat state terbaru sudah utuh tersimpan di server;
      // di sinilah "Tersimpan di server" boleh tampil.
      setOffline(false);
      setSyncState("idle");
      setHasSaved(true);
    } finally {
      syncRunningRef.current = false;
    }
  };

  // Jadwalkan runner setiap ada perubahan yang belum tersimpan
  // (debounce 500ms). Effect ini hanya gerbang penjadwalan — isi diff
  // dihitung ulang oleh runner dari stateRef saat run berjalan.
  useEffect(() => {
    if (!loadedRef.current || loading) return;
    const dirty =
      state.months.some((m) => syncedRef.current.get(m.key) !== m) ||
      (syncedActiveRef.current !== null && syncedActiveRef.current !== state.activeMonth);
    if (!dirty) return;
    const timer = setTimeout(() => {
      void runSync();
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
