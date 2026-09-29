/* Pembaca aliran peristiwa (Server-Sent Events) di atas fetch.

   EventSource bawaan peramban tidak bisa membawa header, padahal di lingkungan tanpa cookie sesi
   harus dikirim lewat header X-Session. Pembaca ini memahami format SSE yang sama (event:, data:,
   baris komentar ": ping") dan menyambung ulang sendiri dengan jeda yang bertambah. */

export interface StreamHandlers {
  onEvent: (name: string, data: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export interface StreamHandle {
  close: () => void;
}

const FIRST_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

export function openEventStream(url: string, headers: () => Record<string, string>, h: StreamHandlers): StreamHandle {
  let closed = false;
  let ctrl: AbortController | null = null;
  let retry = FIRST_RETRY_MS;
  let timer: number | null = null;

  const dispatch = (block: string) => {
    let name = "message";
    const data: string[] = [];
    for (const raw of block.split("\n")) {
      const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
      if (!line || line.startsWith(":")) continue;
      const i = line.indexOf(":");
      const field = i === -1 ? line : line.slice(0, i);
      const value = i === -1 ? "" : line.slice(i + 1).replace(/^ /, "");
      if (field === "event") name = value;
      else if (field === "data") data.push(value);
    }
    if (data.length) h.onEvent(name, data.join("\n"));
  };

  const connect = async () => {
    if (closed) return;
    ctrl = new AbortController();
    try {
      const res = await fetch(url, {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "text/event-stream", ...headers() },
        signal: ctrl.signal,
      });
      if (res.status === 401 || res.status === 403) {
        // sesi tidak sah: jangan menyambung ulang tanpa henti; halaman akan mengarahkan ke /login
        h.onClose?.();
        return;
      }
      if (!res.ok || !res.body) throw new Error("stream " + res.status);
      retry = FIRST_RETRY_MS;
      h.onOpen?.();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.search(/\r?\n\r?\n/)) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx).replace(/^\r?\n\r?\n/, "");
          dispatch(block);
        }
      }
    } catch {
      /* jaringan putus atau dibatalkan: jatuh ke penjadwalan ulang di bawah */
    }
    if (closed) return;
    h.onClose?.();
    timer = window.setTimeout(() => void connect(), retry);
    retry = Math.min(retry * 2, MAX_RETRY_MS);
  };

  void connect();

  return {
    close: () => {
      closed = true;
      if (timer) window.clearTimeout(timer);
      ctrl?.abort();
    },
  };
}
