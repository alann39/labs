import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { seed } from "../seed";
import type { AppState, MasterVa, MonthData } from "../store";

/** ditutup adalah turunan dari snapshot VA (semua closingSelesai). */
export const monthDitutupFlag = (m: MonthData): boolean =>
  Array.isArray(m.vas) && m.vas.length > 0 && m.vas.every((v) => v.closingSelesai === true);

/* Server-only module: Neon Postgres access for the /api routes.
   Driver: @neondatabase/serverless over HTTP. Use sql.query(sql, params)
   with $n placeholders — it resolves to an ARRAY of rows.
   The connection string comes from the runtime env (DATABASE_URL);
   it is never logged or hardcoded. */

type Sql = NeonQueryFunction<false, false>;

let client: Sql | null = null;

export function getSql(): Sql {
  if (!client) {
    const url = process.env.DATABASE_URL ?? import.meta.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL tidak tersedia di environment server");
    client = neon(url);
  }
  return client;
}

let schemaPromise: Promise<void> | null = null;

/** Idempotent DDL, dijalankan sekali per proses. */
export function ensureSchema(sql: Sql): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await sql.query(
        `CREATE TABLE IF NOT EXISTS lpj_months (
           key text PRIMARY KEY,
           ditutup boolean NOT NULL DEFAULT false,
           data jsonb NOT NULL,
           version int NOT NULL DEFAULT 1,
           updated_at timestamptz NOT NULL DEFAULT now()
         )`,
        [],
      );
      await sql.query(
        `CREATE TABLE IF NOT EXISTS lpj_meta (
           k text PRIMARY KEY,
           v text NOT NULL
         )`,
        [],
      );
    })();
  }
  return schemaPromise;
}

/** Seed Jul-Okt 2026 (seed v2) saat tabel masih kosong. Return true bila men-seed. */
export async function seedIfEmpty(sql: Sql): Promise<boolean> {
  const rows = (await sql.query("SELECT COUNT(*)::int AS n FROM lpj_months", [])) as Array<{ n: number }>;
  if (rows[0] && rows[0].n > 0) return false;
  const s = seed();
  for (const m of s.months) {
    await sql.query(
      `INSERT INTO lpj_months (key, ditutup, data, version)
       VALUES ($1, $2, $3::jsonb, 1)
       ON CONFLICT (key) DO NOTHING`,
      [m.key, monthDitutupFlag(m), JSON.stringify(m)],
    );
  }
  await sql.query(
    `INSERT INTO lpj_meta (k, v) VALUES ('activeMonth', $1)
     ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`,
    [s.activeMonth],
  );
  await sql.query(
    `INSERT INTO lpj_meta (k, v) VALUES ('masterVa', $1)
     ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`,
    [JSON.stringify(s.masterVa)],
  );
  return true;
}

/** Master VA dari lpj_meta; default 10 VA standar bila meta kosong/rusak. */
export async function readMasterVa(sql: Sql): Promise<MasterVa[]> {
  const meta = (await sql.query("SELECT v FROM lpj_meta WHERE k = 'masterVa'", [])) as Array<{ v: string }>;
  if (meta[0]?.v) {
    try {
      const parsed = JSON.parse(meta[0].v) as MasterVa[];
      if (Array.isArray(parsed) && parsed.every((x) => x && typeof x.id === "string")) return parsed;
    } catch { /* jatuh ke default di bawah */ }
  }
  return seed().masterVa;
}

export interface StatePayload extends AppState {
  versions: Record<string, number>;
}

/** Baca seluruh state (schema + seed dipastikan dulu). */
export async function readState(sql: Sql): Promise<StatePayload> {
  await ensureSchema(sql);
  await seedIfEmpty(sql);
  const rows = (await sql.query("SELECT data, version FROM lpj_months ORDER BY key", [])) as Array<{
    data: MonthData;
    version: number;
  }>;
  const months = rows.map((r) => r.data);
  const versions: Record<string, number> = {};
  for (const r of rows) versions[r.data.key] = r.version;
  const meta = (await sql.query("SELECT v FROM lpj_meta WHERE k = 'activeMonth'", [])) as Array<{ v: string }>;
  const activeMonth =
    meta[0]?.v && months.some((m) => m.key === meta[0].v)
      ? meta[0].v
      : (months[months.length - 1]?.key ?? seed().activeMonth);
  const masterVa = await readMasterVa(sql);
  return { months, activeMonth, masterVa, versions };
}

/** Hapus semua data lalu seed ulang; dipakai POST /api/reset. */
export async function resetState(sql: Sql): Promise<StatePayload> {
  await ensureSchema(sql);
  await sql.query("DELETE FROM lpj_months", []);
  await sql.query("DELETE FROM lpj_meta", []);
  return readState(sql);
}
