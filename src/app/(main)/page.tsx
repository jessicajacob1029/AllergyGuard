import Link from "next/link";
import { redirect } from "next/navigation";
import { primaryButtonClass, secondaryButtonClass } from "@/components/form-styles";
import { AppIconTile } from "@/components/ui/icons";
import { APP_NAME } from "@/lib/constants";
import { loadScans } from "@/lib/products/scan-list";
import { loadOwnProfile } from "@/lib/profile/load";
import { createClient } from "@/lib/supabase/server";
import { HomeDashboard } from "./home-dashboard";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims) {
    return (
      <main className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-sm px-5 pt-8">
          <AppIconTile size="lg" />
          <p className="eyebrow mt-7">{APP_NAME}</p>
          <h1 className="mt-2 text-[46px] font-medium leading-[0.98] tracking-[-0.05em] text-ink max-[359px]:text-[40px]">
            Scan a product, know if it&apos;s safe for you.
          </h1>
        </div>
        <div className="mx-auto mt-8 flex w-full max-w-sm flex-col gap-3 px-5">
          <Link href="/signup" className={primaryButtonClass}>
            Create account
          </Link>
          <Link href="/login" className={secondaryButtonClass}>
            Log in
          </Link>
        </div>
      </main>
    );
  }

  const bundle = await loadOwnProfile(supabase);
  if (!bundle || bundle.profile.onboarding_completed_at === null) redirect("/onboarding");
  const latestScans = await loadScans(supabase, bundle.profile.id, { limit: 3 });

  return <HomeDashboard bundle={bundle} latestScans={latestScans} today={new Date().toISOString()} />;
}
