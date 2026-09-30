import type { Metadata } from "next";
import { loadState } from "@/lib/server";
import { SessionGate } from "@/components/shell/session-gate";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

export const metadata: Metadata = { title: "Dashboard admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const state = await loadState("/admin", ["admin"]);
  return (
    <SessionGate initial={state} path="/admin" roles={["admin"]}>
      <AdminDashboard />
    </SessionGate>
  );
}
