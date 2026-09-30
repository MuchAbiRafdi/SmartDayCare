"use client";
import * as React from "react";
import { Copy } from "lucide-react";
import { api } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { fmtDateShort, ROLE_LABEL } from "@/lib/format";
import { useAction, useLive } from "@/lib/live";
import type { InviteCode } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

function inviteMeta(inv: InviteCode): string {
  const parts: string[] = [];
  if (inv.expiresAt) parts.push(`Berlaku s/d ${fmtDateShort(inv.expiresAt)}`);
  else parts.push("Tanpa batas waktu");
  if (inv.maxUses !== null) parts.push(`${inv.uses}/${inv.maxUses} dipakai`);
  else parts.push(`${inv.uses} kali dipakai`);
  return parts.join(" · ");
}

export function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refresh } = useLive();
  const { busy, run } = useAction();
  const toast = useToast();
  const [created, setCreated] = React.useState<InviteCode | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const uses = String(f.get("maxUses"));
    const r = await run(() =>
      api.post<{ invite: InviteCode }>("/api/admin/invites", {
        role: f.get("role"),
        label: String(f.get("label") ?? "").trim(),
        days: Number(f.get("days")),
        maxUses: uses === "unlimited" ? null : Number(uses),
      }),
    );
    if (r) {
      setCreated(r.invite);
      await refresh();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {open ? (
        created ? (
          <DialogContent title="Kode undangan dibuat" desc={`${ROLE_LABEL[created.role]} · ${inviteMeta(created)}`}>
            <div className="grid gap-3">
              <div className="border-line code-reveal rounded-lg border px-4 py-4 text-center">
                <div className="font-mono text-[24px] font-semibold tracking-[0.12em]">{created.code}</div>
              </div>
              <div className="text-muted text-[13.5px] leading-relaxed">
                Sampaikan kode ini langsung kepada {created.label || "orang tua atau staf yang bersangkutan"}. Kode tercantum di daftar dan bisa dinonaktifkan kapan saja.
              </div>
              <Button
                variant="default"
                onClick={async () => {
                  const ok = await copyText(created.code);
                  toast(ok ? `${created.code} disalin.` : `Tidak bisa menyalin otomatis. Salin manual: ${created.code}`, ok ? "ok" : "info");
                }}
              >
                <Copy size={15} /> Salin kode
              </Button>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="primary" onClick={onClose}>
                Selesai
              </Button>
            </div>
          </DialogContent>
        ) : (
          <DialogContent title="Buat kode undangan" desc="Untuk orang tua, pengasuh, atau admin baru. Kode lama tidak terpengaruh.">
            <form onSubmit={submit} className="grid gap-3">
              <Field label="Peran" htmlFor="inv-role">
                <Select id="inv-role" name="role" defaultValue="parent">
                  <option value="parent">Orang Tua / Wali Anak</option>
                  <option value="caregiver">Pengasuh / Pendidik</option>
                  <option value="admin">Admin daycare</option>
                </Select>
              </Field>
              <Field label="Untuk siapa" htmlFor="inv-label" hint="Opsional, mis. nama orang tua / calon staf. Memudahkan penelusuran.">
                <Input id="inv-label" name="label" maxLength={80} autoComplete="off" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Masa berlaku" htmlFor="inv-days">
                  <Select id="inv-days" name="days" defaultValue="7">
                    <option value="3">3 hari</option>
                    <option value="7">7 hari</option>
                    <option value="14">14 hari</option>
                    <option value="30">30 hari</option>
                    <option value="90">90 hari</option>
                  </Select>
                </Field>
                <Field label="Jumlah pemakaian" htmlFor="inv-uses">
                  <Select id="inv-uses" name="maxUses" defaultValue="1">
                    <option value="1">1 kali (disarankan)</option>
                    <option value="3">3 kali</option>
                    <option value="10">10 kali</option>
                    <option value="unlimited">Tanpa batas</option>
                  </Select>
                </Field>
              </div>
              <div className="mt-1 flex justify-end gap-2">
                <Button variant="ghost" onClick={onClose}>
                  Batal
                </Button>
                <Button type="submit" variant="primary" disabled={busy}>
                  {busy ? "Membuat…" : "Buat kode"}
                </Button>
              </div>
            </form>
          </DialogContent>
        )
      ) : null}
    </Dialog>
  );
}
