import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { namaBulan, nextMonthKey } from "./format";
import { seed } from "./seed";

/* ================= Model (kontrak revisi 2026-11-07) =================
   Tidak ada tahap proses lagi. Satu bulan berisi snapshot VA plus dua
   daftar catatan: LPJ yang sudah disetujui dan DanaMasuk yang sudah
   ditransfer. Dana masuk selalu catatan eksplisit: "awal" (isi saldo
   normal penuh dari closing), "kembali" (pengisian kembali tertaut ke
   satu LPJ reguler), atau "khusus" (pengisian atas permintaan khusus,
   dipertanggungjawabkan oleh satu LPJ khusus). */

export interface LpjRecord {
  id: string;
  no: string;
  vaId: string;
  tanggal: string; // ISO yyyy-mm-dd
  nominal: number;
  keterangan: string;
  jenis: "reguler" | "khusus";
  khususDariMasukId?: string; // wajib untuk jenis khusus
  lpjClosing: boolean; // tanda "LPJ Closing" (LPJ terakhir bulan itu)
}

export interface DanaMasukRecord {
  id: string;
  vaId: string;
  tanggal: string; // ISO yyyy-mm-dd
  nominal: number;
  jenis: "awal" | "kembali" | "khusus";
  lpjId?: string; // untuk "kembali": LPJ reguler yang diisi kembali
  keterangan?: string;
  referensiNama?: string; // nama file referensi (opsional, khusus)
}

export interface Pengembalian {
  status: "belum" | "sebagian" | "diterima" | "tidak-perlu";
  totalDiterima: number;
  tanggal?: string;
  catatan?: string;
}

export interface VA {
  id: string;
  nama: string;
  nomor: string;
  grup: string;
  saldoNormal: number;
  sisaBank: number;
  sisaDiinput: boolean;
  pengembalian: Pengembalian;
  closingSelesai: boolean;
}

export interface MonthData {
  key: string; // "2026-10"
  vas: VA[];
  lpj: LpjRecord[];
  masuk: DanaMasukRecord[];
}

export interface MasterVa {
  id: string;
  nama: string;
  nomor: string;
  grup: string;
  saldoNormal: number;
  aktif: boolean;
}

export interface AppState {
  months: MonthData[];
  activeMonth: string;
  masterVa: MasterVa[];
}

/** ditutup adalah turunan: semua VA sudah closing. */
export const monthDitutup = (m: MonthData): boolean =>
  m.vas.length > 0 && m.vas.every((v) => v.closingSelesai);

/* ================= Hitungan ================= */

export interface VaStats {
  lpj: number;
  lpjReguler: number;
  lpjKhusus: number;
  masuk: number;
  masukAwal: number;
  masukKembali: number;
  masukKhusus: number;
  dk: number; // selisih / dana dikembalikan
}

export function vaStats(m: MonthData, va: VA): VaStats {
  let lpjReguler = 0, lpjKhusus = 0, awal = 0, kembali = 0, khusus = 0;
  for (const r of m.lpj) {
    if (r.vaId !== va.id) continue;
    if (r.jenis === "khusus") lpjKhusus += r.nominal; else lpjReguler += r.nominal;
  }
  for (const r of m.masuk) {
    if (r.vaId !== va.id) continue;
    if (r.jenis === "awal") awal += r.nominal;
    else if (r.jenis === "kembali") kembali += r.nominal;
    else khusus += r.nominal;
  }
  const masuk = awal + kembali + khusus;
  const lpj = lpjReguler + lpjKhusus;
  return {
    lpj, lpjReguler, lpjKhusus, masuk,
    masukAwal: awal, masukKembali: kembali, masukKhusus: khusus,
    dk: masuk - lpj - va.sisaBank,
  };
}

/** Status pengembalian efektif: dk <= 0 tidak perlu pengembalian. */
export function statusPengembalian(m: MonthData, va: VA): Pengembalian["status"] {
  const { dk } = vaStats(m, va);
  if (dk <= 0) return "tidak-perlu";
  if (va.pengembalian.status === "diterima" && va.pengembalian.totalDiterima >= dk) return "diterima";
  if (va.pengembalian.totalDiterima > 0) return "sebagian";
  return "belum";
}

export type VaStatus = "closing" | "kurang" | "menunggu" | "sebagian" | "siap";
export const VA_STATUS_BADGE: Record<VaStatus, { tone: "success" | "danger" | "warning" | "info" | "neutral"; label: string }> = {
  closing: { tone: "success", label: "Sudah closing" },
  kurang: { tone: "danger", label: "Kelebihan LPJ" },
  menunggu: { tone: "warning", label: "Menunggu pengembalian" },
  sebagian: { tone: "warning", label: "Diterima sebagian" },
  siap: { tone: "info", label: "Siap closing" },
};

/** Satu badge paling relevan untuk VA ini (aturan di spec revisi). */
export function vaStatus(m: MonthData, va: VA): VaStatus {
  if (va.closingSelesai) return "closing";
  const s = vaStats(m, va);
  if (s.dk < 0) return "kurang";
  if (s.dk > 0) {
    const p = statusPengembalian(m, va);
    if (p === "belum") return "menunggu";
    if (p === "sebagian") return "sebagian";
  }
  return "siap";
}

export const PENGEMBALIAN_LABEL: Record<Pengembalian["status"], string> = {
  belum: "Belum diterima",
  sebagian: "Diterima sebagian",
  diterima: "Sudah diterima",
  "tidak-perlu": "Tidak perlu pengembalian",
};

export const MASUK_JENIS_LABEL: Record<DanaMasukRecord["jenis"], string> = {
  awal: "Isi awal",
  kembali: "Pengisian kembali",
  khusus: "Pengisian khusus",
};

/** LPJ reguler sudah diisi kembali bila ada DanaMasuk kembali tertaut. */
export const lpjSudahDiisi = (m: MonthData, lpjId: string): boolean =>
  m.masuk.some((r) => r.jenis === "kembali" && r.lpjId === lpjId);

/** Pengisian khusus sudah dipertanggungjawabkan oleh LPJ khusus. */
export const khususSudahAdaLpj = (m: MonthData, masukId: string): boolean =>
  m.lpj.some((r) => r.jenis === "khusus" && r.khususDariMasukId === masukId);

export interface Totals {
  normal: number; masuk: number; lpj: number; sisa: number; dkPositif: number;
  lpjReguler: number; lpjKhusus: number;
  masukAwal: number; masukKembali: number; masukKhusus: number;
  diterima: number; belumDiterima: number; vaKurang: VA[];
}
export function monthTotals(m: MonthData): Totals {
  let normal = 0, masuk = 0, lpj = 0, sisa = 0, dkPositif = 0;
  let lpjReguler = 0, lpjKhusus = 0, masukAwal = 0, masukKembali = 0, masukKhusus = 0;
  let diterima = 0, belumDiterima = 0;
  const vaKurang: VA[] = [];
  for (const va of m.vas) {
    const s = vaStats(m, va);
    normal += va.saldoNormal; masuk += s.masuk; lpj += s.lpj; sisa += va.sisaBank;
    lpjReguler += s.lpjReguler; lpjKhusus += s.lpjKhusus;
    masukAwal += s.masukAwal; masukKembali += s.masukKembali; masukKhusus += s.masukKhusus;
    if (s.dk > 0) {
      dkPositif += s.dk;
      const p = statusPengembalian(m, va);
      if (p === "diterima") diterima += s.dk;
      else {
        diterima += Math.min(va.pengembalian.totalDiterima, s.dk);
        belumDiterima += s.dk - Math.min(va.pengembalian.totalDiterima, s.dk);
      }
    }
    if (s.dk < 0) vaKurang.push(va);
  }
  return {
    normal, masuk, lpj, sisa, dkPositif, lpjReguler, lpjKhusus,
    masukAwal, masukKembali, masukKhusus, diterima, belumDiterima, vaKurang,
  };
}

/* ================= Store ================= */

export type SyncState = "idle" | "saving" | "error";

export interface LpjInput {
  vaId: string; tanggal: string; nominal: number; keterangan: string;
  jenis: "reguler" | "khusus"; khususDariMasukId?: string; lpjClosing: boolean;
}
export interface MasukInput {
  vaId: string; tanggal: string; nominal: number;
  jenis: "awal" | "kembali" | "khusus"; lpjId?: string;
  keterangan?: string; referensiNama?: string;
}

interface Store {
  state: AppState;
  month: MonthData;
  loading: boolean;
  offline: boolean;
  syncState: SyncState;
  hasSaved: boolean;
  setActiveMonth: (key: string) => void;
  nextNo: () => string;
  addLpj: (p: LpjInput) => LpjRecord;
  updateLpj: (id: string, p: LpjInput) => void;
  deleteLpj: (id: string) => void;
  addMasuk: (p: MasukInput) => DanaMasukRecord;
  updateMasuk: (id: string, p: MasukInput) => void;
  deleteMasuk: (id: string) => boolean; // false bila khusus yang sudah punya LPJ khusus
  setSisaBank: (vaId: string, nilai: number) => void;
  confirmPengembalian: (vaId: string, data: { tanggal: string; nominal: number; catatan?: string }) => void;
  closingVa: (vaId: string) => void;
  addMasterVa: (p: Omit<MasterVa, "id" | "aktif">) => MasterVa;
  updateMasterVa: (id: string, p: Omit<MasterVa, "id" | "aktif">) => void;
  setMasterVaAktif: (id: string, aktif: boolean) => void;
  deleteMasterVa: (id: string) => boolean; // false bila VA punya catatan
  reset: () => void;
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
  const syncedMasterRef = useRef<string | null>(null);
  const loadedRef = useRef(false);
  const idRef = useRef(0);
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

  const newId = (prefix: string) => {
    idRef.current += 1;
    return `${prefix}${Date.now().toString(36)}${idRef.current}`;
  };

  const adoptServerState = (payload: StatePayload) => {
    // Mengadopsi payload berarti app sudah melihat state server asli —
    // catat sebagai baseline sesi ini.
    hasBaselineRef.current = true;
    versionsRef.current = payload.versions ?? {};
    syncedRef.current = new Map(payload.months.map((m) => [m.key, m]));
    syncedActiveRef.current = payload.activeMonth;
    const masterVa = payload.masterVa ?? stateRef.current.masterVa;
    syncedMasterRef.current = JSON.stringify(masterVa);
    setState({ months: payload.months, activeMonth: payload.activeMonth, masterVa });
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
        const masterChanged =
          syncedMasterRef.current !== null && syncedMasterRef.current !== JSON.stringify(latest.masterVa);
        if (changed.length === 0 && !activeChanged && !masterChanged) break;
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
          if (masterChanged) {
            const res = await fetch("/api/master-va", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ masterVa: latest.masterVa }),
            });
            if (!res.ok) throw new Error("sync-gagal");
            syncedMasterRef.current = JSON.stringify(latest.masterVa);
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
      (syncedActiveRef.current !== null && syncedActiveRef.current !== state.activeMonth) ||
      (syncedMasterRef.current !== null && syncedMasterRef.current !== JSON.stringify(state.masterVa));
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
      const nums = month.lpj
        .map((p) => parseInt(p.no.replace(/\D/g, "").slice(-4), 10))
        .filter((n) => !Number.isNaN(n));
      const base = nums.length ? Math.max(...nums) : parseInt(month.key.slice(5, 7), 10) * 100;
      return `LPJ-${month.key.slice(0, 4)}-${String(base + 1).padStart(4, "0")}`;
    },
    addLpj: (p) => {
      const full: LpjRecord = { ...p, id: newId("l"), no: store.nextNo() };
      patchMonth((m) => ({
        ...m,
        lpj: [
          ...m.lpj.map((r) => (full.lpjClosing && r.vaId === full.vaId ? { ...r, lpjClosing: false } : r)),
          full,
        ],
      }));
      return full;
    },
    updateLpj: (id, p) =>
      patchMonth((m) => ({
        ...m,
        lpj: m.lpj.map((r) => {
          if (r.id === id) return { ...r, ...p };
          if (p.lpjClosing && r.vaId === p.vaId) return { ...r, lpjClosing: false };
          return r;
        }),
      })),
    deleteLpj: (id) =>
      patchMonth((m) => ({
        ...m,
        lpj: m.lpj.filter((r) => r.id !== id),
        // Lepaskan tautan pengisian kembali yang menunjuk LPJ ini.
        masuk: m.masuk.map((r) =>
          r.lpjId === id
            ? { ...r, lpjId: undefined, keterangan: r.keterangan?.startsWith("Pengisian kembali LPJ-") ? undefined : r.keterangan }
            : r,
        ),
      })),
    addMasuk: (p) => {
      const full: DanaMasukRecord = { ...p, id: newId("m") };
      patchMonth((m) => ({ ...m, masuk: [...m.masuk, full] }));
      return full;
    },
    updateMasuk: (id, p) =>
      patchMonth((m) => ({ ...m, masuk: m.masuk.map((r) => (r.id === id ? { ...r, ...p } : r)) })),
    deleteMasuk: (id) => {
      const target = month.masuk.find((r) => r.id === id);
      if (!target) return false;
      // DanaMasuk khusus yang sudah punya LPJ khusus tidak boleh dihapus.
      if (target.jenis === "khusus" && khususSudahAdaLpj(month, id)) return false;
      patchMonth((m) => ({ ...m, masuk: m.masuk.filter((r) => r.id !== id) }));
      return true;
    },
    setSisaBank: (vaId, nilai) =>
      patchMonth((m) => ({ ...m, vas: m.vas.map((v) => (v.id === vaId ? { ...v, sisaBank: nilai, sisaDiinput: true } : v)) })),
    confirmPengembalian: (vaId, data) =>
      patchMonth((m) => ({
        ...m,
        vas: m.vas.map((v) => {
          if (v.id !== vaId) return v;
          const totalDiterima = v.pengembalian.totalDiterima + data.nominal;
          const dk = vaStats(m, v).dk;
          return {
            ...v,
            pengembalian: {
              status: totalDiterima >= dk ? "diterima" : "sebagian",
              totalDiterima,
              tanggal: data.tanggal,
              catatan: data.catatan ?? v.pengembalian.catatan,
            },
          };
        }),
      })),
    closingVa: (vaId) =>
      setState((s) => {
        const cur = s.months.find((m) => m.key === s.activeMonth);
        const va = cur?.vas.find((v) => v.id === vaId);
        if (!cur || !va || va.closingSelesai) return s;
        const nk = nextMonthKey(cur.key);
        let months = s.months.map((m) =>
          m.key === cur.key
            ? { ...m, vas: m.vas.map((v) => (v.id === vaId ? { ...v, closingSelesai: true } : v)) }
            : m,
        );
        if (!months.some((m) => m.key === nk)) {
          const fresh: MonthData = {
            key: nk,
            vas: cur.vas.map((v) => ({
              ...v,
              sisaBank: 0,
              sisaDiinput: false,
              pengembalian: { status: "tidak-perlu", totalDiterima: 0 },
              closingSelesai: false,
            })),
            lpj: [],
            masuk: [],
          };
          months = [...months, fresh].sort((a, b) => a.key.localeCompare(b.key));
        }
        // Isi awal bulan berikutnya untuk VA ini: full saldo normal.
        months = months.map((m) => {
          if (m.key !== nk) return m;
          if (m.masuk.some((r) => r.vaId === vaId && r.jenis === "awal")) return m;
          const awal: DanaMasukRecord = {
            id: `awal-${nk}-${vaId}`,
            vaId,
            tanggal: `${nk}-01`,
            nominal: va.saldoNormal,
            jenis: "awal",
            keterangan: "Isi awal bulan, saldo normal penuh",
          };
          return { ...m, masuk: [...m.masuk, awal] };
        });
        return { ...s, months };
      }),
    addMasterVa: (p) => {
      const full: MasterVa = { ...p, id: newId("va"), aktif: true };
      setState((s) => ({
        ...s,
        masterVa: [...s.masterVa, full],
        months: s.months.map((m) =>
          m.key === s.activeMonth
            ? {
                ...m,
                vas: [
                  ...m.vas,
                  {
                    id: full.id, nama: full.nama, nomor: full.nomor, grup: full.grup,
                    saldoNormal: full.saldoNormal, sisaBank: 0, sisaDiinput: false,
                    pengembalian: { status: "tidak-perlu", totalDiterima: 0 }, closingSelesai: false,
                  },
                ],
              }
            : m,
        ),
      }));
      return full;
    },
    updateMasterVa: (id, p) =>
      setState((s) => ({
        ...s,
        masterVa: s.masterVa.map((mv) => (mv.id === id ? { ...mv, ...p } : mv)),
        // Berlaku ke snapshot bulan di mana VA ini belum closing.
        months: s.months.map((m) => ({
          ...m,
          vas: m.vas.map((v) =>
            v.id === id && !v.closingSelesai
              ? { ...v, nama: p.nama, nomor: p.nomor, grup: p.grup, saldoNormal: p.saldoNormal }
              : v,
          ),
        })),
      })),
    setMasterVaAktif: (id, aktif) =>
      setState((s) => ({ ...s, masterVa: s.masterVa.map((mv) => (mv.id === id ? { ...mv, aktif } : mv)) })),
    deleteMasterVa: (id) => {
      const punyaCatatan = state.months.some(
        (m) => m.lpj.some((r) => r.vaId === id) || m.masuk.some((r) => r.vaId === id),
      );
      if (punyaCatatan) return false;
      setState((s) => ({
        ...s,
        masterVa: s.masterVa.filter((mv) => mv.id !== id),
        months: s.months.map((m) => ({
          ...m,
          vas: m.vas.filter((v) => !(v.id === id && !v.closingSelesai)),
        })),
      }));
      return true;
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
