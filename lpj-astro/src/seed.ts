import { MASTER_VA, SEED_MONTHS } from "./seed-data";
import type { AppState } from "./store";

/* ================= Seed v2: Jul-Okt 2026, model catatan =================
   Data dihasilkan gen-seed-v2.py dari juli-september-extract.json +
   oktober-extract.json (ekstraksi REKAP_LPJ.xlsx) dan tinggal di
   ./seed-data. Dipakai bersama oleh API server untuk men-seed database
   dan oleh store sebagai placeholder lokal. */

export const seed = (): AppState => ({
  months: JSON.parse(JSON.stringify(SEED_MONTHS)) as AppState["months"],
  activeMonth: "2026-10",
  masterVa: JSON.parse(JSON.stringify(MASTER_VA)) as AppState["masterVa"],
});
