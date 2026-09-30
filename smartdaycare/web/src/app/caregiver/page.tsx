import type { Metadata } from "next";
import { loadState } from "@/lib/server";
import { SessionGate } from "@/components/shell/session-gate";
import { CaregiverDashboard } from "@/components/caregiver/caregiver-dashboard";

export const metadata: Metadata = { title: "Dasbor pengasuh" };
export const dynamic = "force-dynamic";

export default async function CaregiverPage() {
  const state = await loadState("/caregiver", ["caregiver", "admin"]);
  return (
    <SessionGate initial={state} path="/caregiver" roles={["caregiver", "admin"]}>
      <CaregiverDashboard />
    </SessionGate>
  );
}
