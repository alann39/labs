import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { addDays, namaBulan, nextMonthKey } from "./format";

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

/* ================= Seed: Oktober 2026 (angka persis rekap asli) ================= */

const VA_DEF: Array<Omit<VA, "sisaBank" | "sisaDiinput" | "konfirmasiClosing">> = [
  { id: "ga", nama: "General Affair", nomor: "81028902001", grup: "General Affair", saldoNormal: 20_000_000 },
  { id: "p1", nama: "Procurement 001", nomor: "81028901001", grup: "Procurement", saldoNormal: 100_000_000 },
  { id: "p2", nama: "Procurement 002", nomor: "81028901002", grup: "Procurement", saldoNormal: 200_000_000 },
  { id: "fms", nama: "FMS", nomor: "81028903006", grup: "FMS", saldoNormal: 5_000_000 },
  { id: "pematangan", nama: "Konstruksi Pematangan", nomor: "81028903004", grup: "Konstruksi", saldoNormal: 5_000_000 },
  { id: "padel", nama: "Konstruksi Padel SIER", nomor: "81028903005", grup: "Konstruksi", saldoNormal: 5_000_000 },
  { id: "kiw", nama: "Konstruksi BPSP KIW", nomor: "81028903002", grup: "Konstruksi", saldoNormal: 5_000_000 },
  { id: "wokbn", nama: "Konstruksi WO KBN", nomor: "81028903007", grup: "Konstruksi", saldoNormal: 5_000_000 },
  { id: "infra", nama: "Konstruksi Infra FO", nomor: "81028903003", grup: "Konstruksi", saldoNormal: 5_000_000 },
  { id: "pompa", nama: "Konstruksi Rumah Pompa", nomor: "81028903001", grup: "Konstruksi", saldoNormal: 5_000_000 },
];

function seedOktober(): MonthData {
  const sisa: Record<string, number> = {
    ga: 1_625_193, p1: 29_661_778, p2: 169_500_000, fms: 4_795_900,
    pematangan: 0, padel: 865, kiw: 1_508_898, wokbn: 0, infra: 0, pompa: 0,
  };
  const vas: VA[] = VA_DEF.map((d) => ({
    ...d,
    sisaBank: sisa[d.id],
    sisaDiinput: d.id !== "pematangan",
    konfirmasiClosing: d.id === "p2" || d.id === "pompa",
  }));
  const P = (id: string, no: string, vaId: string, tanggal: string, nominal: number, keterangan: string, stage: Stage, isiOffset?: number): Proses => ({
    id, no, vaId, tanggal, nominal, keterangan, stage,
    tanggalIsi: isiOffset !== undefined ? addDays(tanggal, isiOffset) : undefined,
  });
  const proses: Proses[] = [
    // General Affair: isi kembali total 218.707.748, menunggu 17.500.494 -> LPJ 236.208.242
    P("g1", "LPJ-2026-1041", "ga", "2026-10-02", 19_235_300, "Operasional kantor", "selesai", 3),
    P("g2", "LPJ-2026-1042", "ga", "2026-10-03", 25_000_000, "Renovasi ruang arsip", "selesai", 1),
    P("g3", "LPJ-2026-1044", "ga", "2026-10-06", 11_646_650, "ATK dan kurir", "selesai", 1),
    P("g4", "LPJ-2026-1047", "ga", "2026-10-08", 11_077_503, "Sewa dan utilitas", "selesai", 1),
    P("g5", "LPJ-2026-1048", "ga", "2026-10-10", 32_480_370, "Pemeliharaan gedung", "selesai", 1),
    P("g6", "LPJ-2026-1050", "ga", "2026-10-13", 14_267_925, "Perjalanan dinas", "selesai", 0),
    P("g7", "LPJ-2026-1051", "ga", "2026-10-15", 45_000_000, "Pengadaan perangkat IT", "selesai", 1),
    P("g8", "LPJ-2026-1052", "ga", "2026-10-17", 60_000_000, "Renovasi lantai 2", "selesai", 3),
    P("g9", "LPJ-2026-1053", "ga", "2026-10-20", 8_450_000, "Konsumsi rapat direksi", "disetujui"),
    P("g10", "LPJ-2026-1054", "ga", "2026-10-22", 9_050_494, "Pemeliharaan kendaraan operasional", "disetujui"),
    // Procurement 001: isi kembali 689.217.344, menunggu 70.335.934 -> LPJ 759.553.278
    P("a1", "LPJ-2026-1031", "p1", "2026-10-03", 150_000_000, "Pengadaan material proyek A", "selesai", 1),
    P("a2", "LPJ-2026-1033", "p1", "2026-10-07", 125_500_000, "Pengadaan baja dan semen", "selesai", 2),
    P("a3", "LPJ-2026-1035", "p1", "2026-10-10", 98_750_000, "Sewa alat berat", "selesai", 1),
    P("a4", "LPJ-2026-1038", "p1", "2026-10-14", 110_467_344, "Pengadaan panel listrik", "selesai", 2),
    P("a5", "LPJ-2026-1040", "p1", "2026-10-17", 84_500_000, "Pengadaan pipa dan fitting", "selesai", 1),
    P("a6", "LPJ-2026-1043", "p1", "2026-10-21", 120_000_000, "Pengadaan material proyek B", "selesai", 2),
    P("a7", "LPJ-2026-1045", "p1", "2026-10-24", 45_335_934, "Pengadaan kabel dan aksesoris", "disetujui"),
    P("a8", "LPJ-2026-1046", "p1", "2026-10-27", 25_000_000, "Pengadaan safety equipment", "disetujui"),
    // FMS: semua selesai -> LPJ 4.795.900
    P("f1", "LPJ-2026-1032", "fms", "2026-10-05", 2_150_000, "Jasa kebersihan", "selesai", 1),
    P("f2", "LPJ-2026-1037", "fms", "2026-10-12", 1_645_900, "Perawatan AC", "selesai", 1),
    P("f3", "LPJ-2026-1049", "fms", "2026-10-19", 1_000_000, "Jasa keamanan tambahan", "selesai", 2),
    // Konstruksi: disetujui, belum ada pengisian kembali
    P("d1", "LPJ-2026-1034", "padel", "2026-10-09", 3_150_000, "Material lapangan padel", "disetujui"),
    P("d2", "LPJ-2026-1039", "padel", "2026-10-16", 3_142_263, "Upah tukang padel", "disetujui"),
    P("k1", "LPJ-2026-1036", "kiw", "2026-10-08", 1_450_000, "Material BPSP", "disetujui"),
    P("k2", "LPJ-2026-1059", "kiw", "2026-10-15", 1_416_848, "Upah harian BPSP", "disetujui"),
    P("w1", "LPJ-2026-1030", "wokbn", "2026-10-07", 3_900_000, "Material WO KBN", "disetujui"),
    P("w2", "LPJ-2026-1058", "wokbn", "2026-10-14", 2_787_428, "Upah WO KBN", "disetujui"),
    P("i1", "LPJ-2026-1057", "infra", "2026-10-11", 5_000_736, "Pemasangan fiber optic", "disetujui"),
  ];
  return { key: "2026-10", vas, proses, ditutup: false };
}

const seed = (): AppState => ({ months: [seedOktober()], activeMonth: "2026-10" });

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

interface Store {
  state: AppState;
  month: MonthData;
  setActiveMonth: (key: string) => void;
  addProses: (p: Omit<Proses, "id" | "no" | "stage">) => Proses;
  advanceProses: (prosesId: string) => void;
  setSisaBank: (vaId: string, nilai: number) => void;
  tutupBulan: () => void;
  reset: () => void;
  nextNo: () => string;
}

const Ctx = createContext<Store | null>(null);
const KEY = "lpj-prototype-v1";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppState;
        if (Array.isArray(parsed.months) && parsed.months.length > 0) return parsed;
      }
    } catch { /* abaikan, pakai seed */ }
    return seed();
  });

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* abaikan */ }
  }, [state]);

  const month = useMemo(
    () => state.months.find((m) => m.key === state.activeMonth) ?? state.months[state.months.length - 1],
    [state],
  );

  const patchMonth = (fn: (m: MonthData) => MonthData) =>
    setState((s) => ({ ...s, months: s.months.map((m) => (m.key === s.activeMonth ? fn(m) : m)) }));

  const store: Store = {
    state,
    month,
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
    reset: () => setState(seed()),
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore di luar StoreProvider");
  return s;
}

export { namaBulan };
