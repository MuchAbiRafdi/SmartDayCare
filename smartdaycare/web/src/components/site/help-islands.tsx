"use client";
import * as React from "react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/live";
import type { Faq, Ticket, User } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/panel";
import { FaqList } from "./landing-islands";
import { fmtDateShort } from "@/lib/format";

export function FaqSearch({ items }: { items: Faq[] }) {
  const [q, setQ] = React.useState("");
  const list = items.filter((f) => !q || (f.q + " " + f.a).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="grid gap-4">
      <Input aria-label="Cari pertanyaan" placeholder="Cari, misal: kamera, kode anak, hapus data" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length ? <FaqList items={list} /> : <Empty>Tidak ada pertanyaan yang cocok. Kirim pertanyaan Anda lewat formulir di bawah.</Empty>}
    </div>
  );
}

const TOPICS = ["Akun & masuk", "Kode anak", "Kamera & privasi", "Makan & gizi", "Tagihan", "Lainnya"];

export function TicketForm({ me, tickets }: { me: User | null; tickets: Ticket[] }) {
  const { busy, run } = useAction();
  const [list, setList] = React.useState(tickets);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const body = { name: f.get("name"), email: f.get("email"), org: "", topic: f.get("topic"), msg: f.get("msg") };
    const r = await run(() => api.post<{ id: string; message: string }>("/api/tickets", body), { ok: (r) => r.message });
    if (r) {
      setList((xs) => [
        {
          id: r.id,
          at: new Date().toISOString(),
          name: String(body.name),
          email: String(body.email),
          org: "",
          topic: String(body.topic),
          msg: String(body.msg),
          status: "open",
        },
        ...xs,
      ]);
      form.reset();
    }
  };
  return (
    <div className="grid gap-6">
      <form onSubmit={submit} className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nama" htmlFor="t-name">
            <Input id="t-name" name="name" required minLength={2} defaultValue={me?.name ?? ""} />
          </Field>
          <Field label="Email" htmlFor="t-email">
            <Input id="t-email" name="email" type="email" required defaultValue={me?.email ?? ""} />
          </Field>
        </div>
        <Field label="Topik" htmlFor="t-topic">
          <Select id="t-topic" name="topic" required>
            {TOPICS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Pertanyaan" htmlFor="t-msg">
          <Textarea id="t-msg" name="msg" required minLength={5} maxLength={2000} />
        </Field>
        <div>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Mengirim…" : "Kirim pertanyaan"}
          </Button>
        </div>
      </form>
      {me ? (
        <div>
          <h3 className="mb-2 text-[15px]">Pertanyaan Anda</h3>
          {list.length ? (
            <ul className="divide-line border-line divide-y rounded-lg border">
              {list.map((t) => (
                <li key={t.id} className="px-4 py-3 text-[14px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted font-mono text-[12.5px]">{t.id}</span>
                    <b>{t.topic}</b>
                    <Badge tone={t.status === "open" ? "warn" : t.status === "answered" ? "accent" : "neutral"}>
                      {t.status === "open" ? "Menunggu balasan" : t.status === "answered" ? "Dibalas" : "Selesai"}
                    </Badge>
                    <span className="text-muted ml-auto text-[12.5px]">{fmtDateShort(t.at)}</span>
                  </div>
                  <p className="text-ink-2 mt-1">{t.msg}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted text-[14px]">Belum ada pertanyaan yang Anda kirim.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
