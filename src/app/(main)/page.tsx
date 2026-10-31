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
      <main className="flex flex-1 flex-col items-center px-5 pb-10 pt-8 text-center md:justify-center md:py-16">
        <div className="flex w-full max-w-sm flex-col items-center md:max-w-[480px]">
          <AppIconTile size="lg" />
          <p className="eyebrow mt-7 md:mt-10">{APP_NAME}</p>
          <h1 className="mt-2 text-[42px] font-medium leading-[1] tracking-[-0.05em] text-ink max-[359px]:text-[36px] md:mt-4 md:text-[56px]">
            Know what&apos;s in it before it&apos;s in you.
          </h1>
          <p className="mt-4 max-w-[340px] text-[16px] leading-relaxed text-muted md:mt-5 md:text-lg">
            Scan any packet and see if it&apos;s safe for you, in seconds.
          </p>
          <div className="mt-8 flex w-full flex-col gap-3 md:mt-12 md:gap-4">
            <Link href="/signup" className={primaryButtonClass}>
              Create account
            </Link>
            <Link href="/login" className={secondaryButtonClass}>
              Log in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const bundle = await loadOwnProfile(supabase);
  if (!bundle || bundle.profile.onboarding_completed_at === null) redirect("/onboarding");
  const latestScans = await loadScans(supabase, bundle.profile.id, { limit: 3 });

  return <HomeDashboard bundle={bundle} latestScans={latestScans} today={new Date().toISOString()} />;
}
