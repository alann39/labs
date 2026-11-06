import type { APIRoute } from "astro";
import { ensureSchema, getSql } from "../../lib/db";

export const prerender = false;

/** Set bulan aktif (lpj_meta.activeMonth). */
export const PUT: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const key = (body as { key?: unknown })?.key;
  if (typeof key !== "string" || key.length === 0) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  try {
    const sql = getSql();
    await ensureSchema(sql);
    await sql.query(
      `INSERT INTO lpj_meta (k, v) VALUES ('activeMonth', $1)
       ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`,
      [key],
    );
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "server-error" }, { status: 500 });
  }
};
