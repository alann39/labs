import type { APIRoute } from "astro";
import { ensureSchema, getSql } from "../../lib/db";
import type { MasterVa } from "../../store";

export const prerender = false;

function isMasterVaList(d: unknown): d is MasterVa[] {
  return (
    Array.isArray(d) &&
    d.every(
      (x) =>
        typeof x === "object" && x !== null &&
        typeof (x as MasterVa).id === "string" &&
        typeof (x as MasterVa).nama === "string" &&
        typeof (x as MasterVa).nomor === "string" &&
        typeof (x as MasterVa).grup === "string" &&
        typeof (x as MasterVa).saldoNormal === "number" &&
        typeof (x as MasterVa).aktif === "boolean",
    )
  );
}

/** Simpan daftar master VA ke lpj_meta (k = 'masterVa', v = JSON). */
export const PUT: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const masterVa = (body as { masterVa?: unknown })?.masterVa;
  if (!isMasterVaList(masterVa)) {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  try {
    const sql = getSql();
    await ensureSchema(sql);
    await sql.query(
      `INSERT INTO lpj_meta (k, v) VALUES ('masterVa', $1)
       ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`,
      [JSON.stringify(masterVa)],
    );
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "server-error" }, { status: 500 });
  }
};
