/* Penyimpanan sesi di peramban untuk jalur header.

   Sesi normalnya hidup sebagai cookie HttpOnly yang tidak pernah disentuh JavaScript. Namun ada
   lingkungan tempat cookie tidak pernah sampai ke server: proxy pratinjau yang membuang header
   Cookie, atau aplikasi dibuka di dalam bingkai situs lain oleh peramban yang memblokir cookie
   pihak ketiga. Untuk itu server juga menerima sesi lewat header `X-Session`, dan token hanya
   disimpan di sini bila cookie terbukti tidak bekerja (lihat finishSignIn di auth-forms). */

const KEY = "sd_session";
let memory: string | null = null;

function read(store: Storage | undefined): string | null {
  try {
    return store?.getItem(KEY) ?? null;
  } catch {
    return null; // akses penyimpanan bisa dilarang di bingkai lintas situs
  }
}

export function getSessionToken(): string | null {
  if (memory) return memory;
  if (typeof window === "undefined") return null;
  memory = read(window.sessionStorage) ?? read(window.localStorage);
  return memory;
}

/** Simpan token; kembalikan true bila tersimpan di penyimpanan peramban (bertahan saat muat ulang). */
export function storeSessionToken(token: string, remember: boolean): boolean {
  memory = token;
  let persisted = false;
  try {
    window.sessionStorage.setItem(KEY, token);
    persisted = true;
  } catch {
    /* penyimpanan sesi tidak tersedia; token tetap hidup di memori halaman ini */
  }
  try {
    if (remember) {
      window.localStorage.setItem(KEY, token);
      persisted = true;
    } else window.localStorage.removeItem(KEY);
  } catch {
    /* sama seperti di atas */
  }
  return persisted;
}

export function clearSessionToken(): void {
  memory = null;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* abaikan */
  }
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* abaikan */
  }
}
