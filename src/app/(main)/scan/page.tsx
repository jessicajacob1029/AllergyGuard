import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HeaderBand } from "@/components/ui/header-band";
import { APP_NAME } from "@/lib/constants";
import { loadOwnProfile } from "@/lib/profile/load";
import { createClient } from "@/lib/supabase/server";
import { Scanner } from "./scanner";

export const metadata: Metadata = { title: `Scan a product · ${APP_NAME}` };

export default async function ScanPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login?next=/scan");
  const bundle = await loadOwnProfile(supabase);
  if (!bundle || bundle.profile.onboarding_completed_at === null) redirect("/onboarding");

  return (
    <main className="flex flex-1 flex-col bg-page">
      <HeaderBand title="Scan a product" subtitle="Check a product against your allergy profile." />
      <div className="mx-auto w-full max-w-sm px-4 py-6">
        <Scanner />
      </div>
    </main>
  );
}
