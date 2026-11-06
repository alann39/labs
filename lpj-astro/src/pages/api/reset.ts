import type { APIRoute } from "astro";
import { getSql, resetState } from "../../lib/db";

export const prerender = false;

/** Hapus semua bulan, seed ulang, kembalikan state segar. */
export const POST: APIRoute = async () => {
  try {
    const state = await resetState(getSql());
    return Response.json(state);
  } catch {
    return Response.json({ error: "server-error" }, { status: 500 });
  }
};
