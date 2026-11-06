import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { seed } from "../seed";
import type { AppState, MonthData } from "../store";

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

/** Seed Oktober 2026 saat tabel masih kosong. Return true bila men-seed. */
export async function seedIfEmpty(sql: Sql): Promise<boolean> {
  const rows = (await sql.query("SELECT COUNT(*)::int AS n FROM lpj_months", [])) as Array<{ n: number }>;
  if (rows[0] && rows[0].n > 0) return false;
  const s = seed();
  for (const m of s.months) {
    await sql.query(
      `INSERT INTO lpj_months (key, ditutup, data, version)
       VALUES ($1, $2, $3::jsonb, 1)
       ON CONFLICT (key) DO NOTHING`,
      [m.key, m.ditutup, JSON.stringify(m)],
    );
  }
  await sql.query(
    `INSERT INTO lpj_meta (k, v) VALUES ('activeMonth', $1)
     ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`,
    [s.activeMonth],
  );
  return true;
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
  return { months, activeMonth, versions };
}

/** Hapus semua data lalu seed ulang; dipakai POST /api/reset. */
export async function resetState(sql: Sql): Promise<StatePayload> {
  await ensureSchema(sql);
  await sql.query("DELETE FROM lpj_months", []);
  await sql.query("DELETE FROM lpj_meta", []);
  return readState(sql);
}
