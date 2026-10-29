import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { APP_NAME } from "@/lib/constants";
import { loadScans, parseVerdictFilter } from "@/lib/products/scan-list";
import { loadOwnProfile } from "@/lib/profile/load";
import { createClient } from "@/lib/supabase/server";
import { SCAN_HISTORY_LIMIT, ScanHistoryView } from "./scan-history-view";

export const metadata: Metadata = { title: `Scan history · ${APP_NAME}` };

export default async function ScanHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ verdict?: string | string[] }>;
}) {
  const verdict = parseVerdictFilter((await searchParams).verdict);
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(verdict ? `/login?next=${encodeURIComponent(`/scans?verdict=${verdict}`)}` : "/login?next=/scans");

  const bundle = await loadOwnProfile(supabase);
  if (!bundle || bundle.profile.onboarding_completed_at === null) redirect("/onboarding");

  // RLS limits rows to the user's own profiles; the profile filter picks this one.
  const scans = await loadScans(supabase, bundle.profile.id, { verdict, limit: SCAN_HISTORY_LIMIT });
  return <ScanHistoryView scans={scans} verdict={verdict} />;
}
