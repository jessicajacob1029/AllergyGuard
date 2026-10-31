import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { nameFromMetadata } from "@/lib/auth/oauth";
import { APP_NAME } from "@/lib/constants";
import { loadOwnProfile } from "@/lib/profile/load";
import { resumeStep } from "@/lib/profile/onboarding";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = {
  title: `Set up your profile · ${APP_NAME}`,
};

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login?next=/onboarding");

  const bundle = await loadOwnProfile(supabase);
  const step = resumeStep({
    profile: bundle?.profile ?? null,
    allergenCount: bundle?.allergens.length ?? 0,
  });
  if (step === 6) redirect("/");

  return (
    <main className="flex flex-1 flex-col bg-page">
      {/* Google accounts come with a name: start the name step with it (editable). */}
      <OnboardingWizard initialStep={step} bundle={bundle} suggestedName={nameFromMetadata(data.claims.user_metadata)} />
    </main>
  );
}
