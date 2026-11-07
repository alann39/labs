import type { APIRoute } from "astro";
import { ensureSchema, getSql, monthDitutupFlag } from "../../lib/db";
import type { MonthData } from "../../store";

export const prerender = false;

function isMonthData(d: unknown): d is MonthData {
  if (typeof d !== "object" || d === null) return false;
  const m = d as Record<string, unknown>;
  return typeof m.key === "string" && Array.isArray(m.vas) && Array.isArray(m.lpj) && Array.isArray(m.masuk);
}

/** Insert bulan baru (dipakai closing VA untuk bulan berikutnya). */
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const data = (body as { data?: unknown })?.data;
  if (!isMonthData(data)) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  try {
    const sql = getSql();
    await ensureSchema(sql);
    const rows = (await sql.query(
      `INSERT INTO lpj_months (key, ditutup, data, version)
       VALUES ($1, $2, $3::jsonb, 1)
       ON CONFLICT (key) DO NOTHING
       RETURNING version`,
      [data.key, monthDitutupFlag(data), JSON.stringify(data)],
    )) as Array<{ version: number }>;
    if (rows.length === 0) {
      return Response.json({ error: "already-exists" }, { status: 409 });
    }
    return Response.json({ version: rows[0].version }, { status: 201 });
  } catch {
    return Response.json({ error: "server-error" }, { status: 500 });
  }
};
