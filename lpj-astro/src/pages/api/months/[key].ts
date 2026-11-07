import type { APIRoute } from "astro";
import { ensureSchema, getSql, monthDitutupFlag } from "../../../lib/db";
import type { MonthData } from "../../../store";

export const prerender = false;

function isMonthData(d: unknown): d is MonthData {
  if (typeof d !== "object" || d === null) return false;
  const m = d as Record<string, unknown>;
  return typeof m.key === "string" && Array.isArray(m.vas) && Array.isArray(m.lpj) && Array.isArray(m.masuk);
}

/** Update satu bulan dengan optimistic concurrency (version harus cocok). */
export const PUT: APIRoute = async ({ params, request }) => {
  const key = params.key;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const data = (body as { data?: unknown })?.data;
  const version = (body as { version?: unknown })?.version;
  if (!key || !isMonthData(data) || data.key !== key || typeof version !== "number") {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  try {
    const sql = getSql();
    await ensureSchema(sql);
    const rows = (await sql.query(
      `UPDATE lpj_months
       SET data = $1::jsonb, ditutup = $2, version = version + 1, updated_at = now()
       WHERE key = $3 AND version = $4
       RETURNING version`,
      [JSON.stringify(data), monthDitutupFlag(data), key, version],
    )) as Array<{ version: number }>;
    if (rows.length > 0) {
      return Response.json({ version: rows[0].version });
    }
    const current = (await sql.query("SELECT version FROM lpj_months WHERE key = $1", [key])) as Array<{
      version: number;
    }>;
    if (current.length === 0) {
      return Response.json({ error: "not-found" }, { status: 404 });
    }
    return Response.json({ error: "version-conflict", version: current[0].version }, { status: 409 });
  } catch {
    return Response.json({ error: "server-error" }, { status: 500 });
  }
};
