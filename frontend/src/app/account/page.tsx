import type { Metadata } from "next";
import { loadState } from "@/lib/server";
import { SessionGate } from "@/components/shell/session-gate";
import { AccountPage } from "@/components/account/account-page";

export const metadata: Metadata = { title: "Akun & privasi" };
export const dynamic = "force-dynamic";

export default async function Account() {
  const state = await loadState("/account");
  return (
    <SessionGate initial={state} path="/account">
      <AccountPage />
    </SessionGate>
  );
}
