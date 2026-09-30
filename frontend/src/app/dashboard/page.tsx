import { Suspense } from "react";
import type { Metadata } from "next";
import { loadState } from "@/lib/server";
import { SessionGate } from "@/components/shell/session-gate";
import { Hub } from "@/components/shell/hub";

export const metadata: Metadata = { title: "Beranda" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const state = await loadState("/dashboard");
  return (
    <SessionGate initial={state} path="/dashboard">
      <Suspense fallback={null}>
        <Hub />
      </Suspense>
    </SessionGate>
  );
}
