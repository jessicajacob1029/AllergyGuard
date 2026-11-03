import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { frameClass } from "@/components/ui/frame";
import { HeaderBand } from "@/components/ui/header-band";
import { APP_NAME } from "@/lib/constants";
import { loadOwnProfile } from "@/lib/profile/load";
import { createClient } from "@/lib/supabase/server";
import { LabelCapture } from "./label-capture";

export const metadata: Metadata = { title: `Label photo · ${APP_NAME}` };

export default async function LabelPhotoPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login?next=/scan/label");
  const bundle = await loadOwnProfile(supabase);
  if (!bundle || bundle.profile.onboarding_completed_at === null) redirect("/onboarding");

  return (
    <main className="flex flex-1 flex-col">
      <HeaderBand eyebrow="Label photo" title="Photo of the label" subtitle="Check an ingredients list against your allergies." />
      <div className={`${frameClass()} pb-6 desk:pb-12`}>
        {/* TEMPORARY: the OCR debug panel shows everywhere except the production deployment. */}
        <LabelCapture debug={process.env.VERCEL_ENV !== "production"} />
      </div>
    </main>
  );
}
