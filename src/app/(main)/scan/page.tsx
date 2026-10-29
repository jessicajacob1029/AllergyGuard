import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { HeaderBand } from "@/components/ui/header-band";
import { ChevronRightIcon } from "@/components/ui/icons";
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
    <main className="flex flex-1 flex-col">
      <HeaderBand
        eyebrow="Product scanner"
        title="Scan a product"
        subtitle="Check a product against your allergy profile."
        aside={
          <Link
            href="/scans"
            className="eyebrow flex min-h-11 shrink-0 items-center gap-0.5 self-start focus-visible:outline-2 focus-visible:outline-primary"
          >
            History <ChevronRightIcon className="size-3.5" />
          </Link>
        }
      />
      <div className="mx-auto w-full max-w-sm px-4 pb-6">
        <Scanner />
      </div>
    </main>
  );
}
