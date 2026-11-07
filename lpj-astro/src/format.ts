const nf = new Intl.NumberFormat("id-ID");

export const fmtNum = (n: number) => nf.format(n);
export const fmtRp = (n: number) => "Rp " + nf.format(n);

/** 238707748 -> "238,7" (juta, satu desimal, koma Indonesia) */
export const fmtJuta = (n: number) => {
  const v = n / 1_000_000;
  return v.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const BULAN_PANJANG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** "2026-10-02" -> "02 Okt" */
export const fmtTgl = (iso: string) => {
  const parts = iso.split("-").map(Number);
  return `${String(parts[2]).padStart(2, "0")} ${BULAN[parts[1] - 1]}`;
};

/** "2026-10-02" -> "02 Okt 2026" */
export const fmtTglPanjang = (iso: string) => `${fmtTgl(iso)} ${iso.slice(0, 4)}`;

/** "2026-10-08" -> "8 Okt" (format pendek untuk sel tabel compact) */
export const fmtTglSingkat = (iso: string) => {
  const parts = iso.split("-").map(Number);
  return `${parts[2]} ${BULAN[parts[1] - 1]}`;
};

export const namaBulan = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return `${BULAN_PANJANG[m - 1]} ${y}`;
};

export const bulanSingkat = (key: string) => BULAN[Number(key.split("-")[1]) - 1];

export const nextMonthKey = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m, 1); // m is 1-based; Date month index m = next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** tambah hari ke tanggal ISO */
export const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

export const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
