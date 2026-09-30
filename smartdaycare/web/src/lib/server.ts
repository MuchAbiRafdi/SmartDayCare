import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchState } from "./api";
import type { Role, State } from "./types";

/** Cuplikan status untuk halaman terlindung, dibaca lewat cookie sesi.

    Mengembalikan null bila cookie tidak ada atau tidak sah — halaman tidak langsung dialihkan,
    karena sesi juga bisa hidup di peramban (jalur header, lihat SessionGate). Bila cookie sah
    tetapi perannya tidak berhak, langsung dialihkan dari server. */
export async function loadState(path: string, roles?: Role[]): Promise<State | null> {
  const jar = await cookies();
  const state = jar.get("sd_session") ? await fetchState(jar.toString()) : null;
  if (state && roles && !roles.includes(state.me.role)) redirect("/dashboard?denied=" + encodeURIComponent(path.replace("/", "")));
  return state;
}
