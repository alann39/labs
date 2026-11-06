import type { APIRoute } from "astro";
import { getSql, readState } from "../../lib/db";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const state = await readState(getSql());
    return Response.json(state);
  } catch {
    return Response.json({ error: "server-error" }, { status: 500 });
  }
};
