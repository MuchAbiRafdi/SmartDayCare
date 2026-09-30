"use client";
/* Percakapan orang tua–daycare (Tema 2): daftar percakapan di kiri, isi percakapan di kanan. */
import * as React from "react";
import { Info, Megaphone, Send, ShieldCheck, UserPlus, Users } from "lucide-react";
import { api } from "@/lib/api";
import { cn, fmtTime, fmtDateShort, initials, isToday } from "@/lib/format";
import { useAction, useLive } from "@/lib/live";
import type { ChatMessage, ChatThread } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/panel";
import { InviteDialog } from "@/components/shared/invite-dialog";

const KIND_ICON = {
  child: null,
  caregiver_direct: Users,
  parent_direct: Users,
  announce: Megaphone,
  admin: ShieldCheck,
  group: Users,
} as const;

const KIND_COLOR: Record<ChatThread["kind"], string> = {
  child: "bg-emerald-100 text-emerald-700",
  caregiver_direct: "bg-sky-100 text-sky-800",
  parent_direct: "bg-teal-100 text-teal-800",
  announce: "bg-slate-200 text-slate-600",
  admin: "bg-amber-100 text-amber-700",
  group: "bg-violet-100 text-violet-700",
};

function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function dayLabel(iso: string): string {
  if (isToday(iso)) return "Hari ini";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Kemarin";
  return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "short" }).format(new Date(iso));
}

function when(iso: string | null): string {
  if (!iso) return "";
  if (isToday(iso)) return fmtTime(iso);
  const d = new Date(iso);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Kemarin";
  return fmtDateShort(iso);
}

export function ChatPanel({ className, initialThread }: { className?: string; initialThread?: string | null }) {
  const { state, patch } = useLive();
  const [threads, setThreads] = React.useState<ChatThread[] | null>(null);
  const [active, setActive] = React.useState<string | null>(initialThread ?? null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [canPost, setCanPost] = React.useState(true);
  const [text, setText] = React.useState("");
  const [mobileList, setMobileList] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [tab, setTab] = React.useState<"all" | "parents" | "staff" | "announce">("all");
  const [showInviteModal, setShowInviteModal] = React.useState(false);
  const { busy, run } = useAction();
  const bottom = React.useRef<HTMLDivElement | null>(null);
  const version = state.serverTime; // berubah setiap cuplikan status baru (SSE) → muat ulang pesan

  const loadThreads = React.useCallback(async () => {
    const r = await api.get<{ threads: ChatThread[] }>("/api/chat/threads");
    setThreads(r.threads);
    return r.threads;
  }, []);

  React.useEffect(() => {
    let live = true;
    loadThreads()
      .then((t) => {
        if (!live) return;
        setActive((cur) => cur ?? t.find((x) => x.unread > 0)?.id ?? t[0]?.id ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [loadThreads, version]);

  React.useEffect(() => {
    if (!active) return;
    let live = true;
    api
      .get<{ thread: { canPost: boolean }; messages: ChatMessage[] }>(`/api/chat/threads/${active}/messages`)
      .then((r) => {
        if (!live) return;
        setMessages(r.messages);
        setCanPost(r.thread.canPost);
        // penanda "terbaca" sudah disimpan di server; perbarui hitungan lokal
        setThreads((ts) => (ts ? ts.map((t) => (t.id === active ? { ...t, unread: 0 } : t)) : ts));
        patch((s) => {
          const t = threads?.find((x) => x.id === active);
          return t && t.unread ? { ...s, chatUnread: Math.max(0, s.chatUnread - t.unread) } : s;
        });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, version]);

  React.useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, active]);

  const send = async () => {
    const t = text.trim();
    if (!t || !active) return;
    const r = await run(() => api.post<{ message: ChatMessage }>(`/api/chat/threads/${active}/messages`, { text: t }), { silent: true });
    if (r) {
      setMessages((m) => [...m, r.message]);
      setText("");
      setThreads((ts) => (ts ? ts.map((x) => (x.id === active ? { ...x, lastAt: r.message.at, lastText: t, lastBy: r.message.by } : x)) : ts));
    }
  };

  const filteredThreads = React.useMemo(() => {
    if (!threads) return null;
    let list = threads;
    if (tab === "parents") {
      list = list.filter((t) => t.kind === "child" || t.kind === "parent_direct");
    } else if (tab === "staff") {
      list = list.filter((t) => t.kind === "admin" || t.kind === "caregiver_direct");
    } else if (tab === "announce") {
      list = list.filter((t) => t.kind === "announce" || t.kind === "group");
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((t) => t.title.toLowerCase().includes(q) || t.subtitle.toLowerCase().includes(q) || (t.lastText && t.lastText.toLowerCase().includes(q)));
  }, [threads, tab, search]);

  const cur = threads?.find((t) => t.id === active) ?? null;

  return (
    <div className={cn("panel grid min-h-[580px] overflow-hidden lg:grid-cols-[330px_minmax(0,1fr)]", className)}>
      <aside className={cn("border-line flex flex-col border-b lg:border-r lg:border-b-0", !mobileList && "hidden lg:flex")}>
        <div className="border-line border-b px-3.5 py-3">
          <div className="flex items-center justify-between pb-2">
            <h2 className="text-[15px] font-semibold">Pesan & Kontak</h2>
            {state.me?.role === "admin" ? (
              <button
                type="button"
                onClick={() => setShowInviteModal(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 px-2 py-1 rounded transition-colors"
                title="Buat kode undangan baru untuk orang tua atau staf"
              >
                <UserPlus size={13} /> Undang Ortu/Staf
              </button>
            ) : null}
          </div>
          {/* Kotak pencarian kontak/pesan */}
          <div className="relative mb-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari pengasuh, ortu, pesan…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-teal-500 focus:outline-none"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1.5 text-xs text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            ) : null}
          </div>
          {/* Tab filter percakapan */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setTab("all")}
              className={cn("flex-1 rounded-md py-1 font-medium transition-colors", tab === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900")}
            >
              Semua
            </button>
            <button
              type="button"
              onClick={() => setTab("staff")}
              className={cn("flex-1 rounded-md py-1 font-medium transition-colors", tab === "staff" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900")}
              title="Pengasuh & Admin Daycare"
            >
              Pengasuh
            </button>
            <button
              type="button"
              onClick={() => setTab("parents")}
              className={cn("flex-1 rounded-md py-1 font-medium transition-colors", tab === "parents" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900")}
              title="Orang Tua & Anak"
            >
              Orang Tua
            </button>
            <button
              type="button"
              onClick={() => setTab("announce")}
              className={cn("flex-1 rounded-md py-1 font-medium transition-colors", tab === "announce" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900")}
              title="Pengumuman & Komunitas"
            >
              Info
            </button>
          </div>
        </div>
        <ul className="m-0 max-h-[60dvh] list-none overflow-y-auto p-2 lg:max-h-none">
          {threads === null ? <li className="text-muted px-3 py-6 text-center text-[13.5px]">Memuat kontak & percakapan…</li> : null}
          {filteredThreads && filteredThreads.length === 0 ? (
            <li className="text-muted px-3 py-6 text-center text-xs">Tidak ada percakapan ditemukan.</li>
          ) : null}
          {filteredThreads?.map((t) => {
            const Icon = KIND_ICON[t.kind];
            const on = t.id === active;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    setActive(t.id);
                    setMobileList(false);
                  }}
                  className={cn("flex w-full items-start gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors", on ? "bg-emerald-50" : "hover:bg-wash")}
                  aria-current={on ? "true" : undefined}
                >
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold", KIND_COLOR[t.kind])}>
                    {Icon ? <Icon size={17} /> : initials(t.title.replace(/^Guru |^Orang tua /, ""))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[14px] font-semibold">{t.title}</span>
                      <span className="text-faint shrink-0 text-[11.5px]">{when(t.lastAt)}</span>
                    </span>
                    <span className="text-muted block truncate text-[12.5px]">
                      {t.lastText ? (t.lastBy ? t.lastBy.split(" ")[0] + ": " : "") + t.lastText : t.subtitle}
                    </span>
                  </span>
                  {t.unread ? (
                    <span className="mt-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-600 px-1 text-[10.5px] font-bold text-white">
                      {t.unread}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
      <section className={cn("flex min-h-[420px] flex-col", mobileList && "hidden lg:flex")} aria-label="Isi percakapan">
        {cur ? (
          <>
            <header className="border-line flex items-center gap-3 border-b px-4 py-3">
              <button type="button" className="text-[13px] font-semibold text-teal-700 lg:hidden" onClick={() => setMobileList(true)}>
                ‹ Daftar
              </button>
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-bold", KIND_COLOR[cur.kind])}>
                {KIND_ICON[cur.kind] ? React.createElement(KIND_ICON[cur.kind]!, { size: 16 }) : initials(cur.title.replace(/^Guru |^Orang tua /, ""))}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">{cur.title}</div>
                <div className="text-muted truncate text-[12.5px]">{cur.subtitle}</div>
              </div>
              <span className="text-faint" title={cur.kind === "announce" ? "Pengumuman resmi daycare" : "Pesan tersimpan di server daycare"}>
                <Info size={17} />
              </span>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {messages.length === 0 ? <Empty>Belum ada pesan. Mulai percakapan di bawah.</Empty> : null}
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const showName = !m.mine && (!prev || prev.userId !== m.userId);
                const newDay = !prev || dayKey(prev.at) !== dayKey(m.at);
                return (
                  <React.Fragment key={m.id}>
                    {newDay ? (
                      <div className="flex items-center gap-3 py-1" role="separator" aria-label={dayLabel(m.at)}>
                        <span className="bg-line h-px flex-1" />
                        <span className="text-faint text-[11.5px] font-semibold tracking-wide uppercase">{dayLabel(m.at)}</span>
                        <span className="bg-line h-px flex-1" />
                      </div>
                    ) : null}
                    <div className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
                      <div className={cn("bubble", m.mine ? "bubble-me" : "bubble-them")}>
                        {showName ? <div className="text-muted mb-0.5 text-[11.5px] font-semibold">{m.by}</div> : null}
                        <div className="whitespace-pre-wrap">{m.text}</div>
                        <div className={cn("mt-1 text-right text-[10.5px]", m.mine ? "text-emerald-800/70" : "text-faint")}>{fmtTime(m.at)}</div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={bottom} />
            </div>
            <footer className="border-line border-t p-3">
              {canPost ? (
                <form
                  className="flex items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void send();
                  }}
                >
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    rows={1}
                    maxLength={1500}
                    placeholder="Tulis pesan…"
                    aria-label="Pesan"
                    className="field max-h-32 min-h-[42px] flex-1 resize-none rounded-full px-4 py-2.5"
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    size="icon"
                    className="h-[42px] w-[42px] rounded-full"
                    disabled={busy || !text.trim()}
                    aria-label="Kirim"
                  >
                    <Send size={17} />
                  </Button>
                </form>
              ) : (
                <p className="text-muted text-center text-[13px]">
                  Pengumuman hanya dikirim oleh pengelola daycare. Balas lewat percakapan Guru atau Admin Daycare.
                </p>
              )}
            </footer>
          </>
        ) : (
          <div className="text-muted flex flex-1 items-center justify-center p-8 text-[14px]">Pilih percakapan.</div>
        )}
      </section>
      {showInviteModal ? (
        <InviteDialog open={showInviteModal} onClose={() => setShowInviteModal(false)} />
      ) : null}
    </div>
  );
}

/** Pengumuman resmi daycare (isi percakapan "Pengumuman"), dipakai di tab Pengumuman orang tua. */
export function AnnouncementsPanel({ onOpenChat, limit = 5 }: { onOpenChat?: () => void; limit?: number }) {
  const { state, patch } = useLive();
  const [items, setItems] = React.useState<ChatMessage[] | null>(null);
  const version = state.serverTime;
  React.useEffect(() => {
    let live = true;
    (async () => {
      const { threads } = await api.get<{ threads: ChatThread[] }>("/api/chat/threads");
      const t = threads.find((x) => x.kind === "announce");
      if (!t) {
        if (live) setItems([]);
        return;
      }
      const r = await api.get<{ messages: ChatMessage[] }>(`/api/chat/threads/${t.id}/messages`);
      if (!live) return;
      setItems([...r.messages].reverse().slice(0, limit));
      if (t.unread) patch((s) => ({ ...s, chatUnread: Math.max(0, s.chatUnread - t.unread) }));
    })().catch(() => {
      if (live) setItems([]);
    });
    return () => {
      live = false;
    };
  }, [version, limit, patch]);
  if (items === null) return <p className="text-muted text-[13px]">Memuat pengumuman…</p>;
  if (!items.length) return <Empty>Belum ada pengumuman dari daycare.</Empty>;
  return (
    <ul className="divide-line m-0 list-none divide-y p-0">
      {items.map((m) => (
        <li key={m.id} className="flex gap-3 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600" aria-hidden>
            <Megaphone size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[14px] leading-relaxed whitespace-pre-line">{m.text}</p>
            <div className="text-muted mt-1 text-[12.5px]">
              {m.by} · {dayLabel(m.at)}, {fmtTime(m.at)}
            </div>
          </div>
        </li>
      ))}
      {onOpenChat ? (
        <li className="pt-3">
          <Button size="sm" onClick={onOpenChat}>
            Buka semua percakapan
          </Button>
        </li>
      ) : null}
    </ul>
  );
}
