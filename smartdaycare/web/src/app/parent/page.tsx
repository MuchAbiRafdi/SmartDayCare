import type { Metadata } from "next";
import { loadState } from "@/lib/server";
import { SessionGate } from "@/components/shell/session-gate";
import { ParentDashboard } from "@/components/parent/parent-dashboard";

export const metadata: Metadata = { title: "Dasbor orang tua" };
export const dynamic = "force-dynamic";

export default async function ParentPage() {
  const state = await loadState("/parent", ["parent", "admin"]);
  return (
    <SessionGate initial={state} path="/parent" roles={["parent", "admin"]}>
      <ParentDashboard />
    </SessionGate>
  );
}
