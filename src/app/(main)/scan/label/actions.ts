"use server";

import { redirect } from "next/navigation";
import { checkLabelText, parseLabelCheckInput } from "@/lib/ocr/check-label";
import { toLabelScanInsert } from "@/lib/products/scan-record";
import { loadOwnProfile } from "@/lib/profile/load";
import { createClient } from "@/lib/supabase/server";

export type CheckLabelResult = { error: string };

/**
 * Checks the text from a label photo with checkAllergens() (via
 * checkLabelText), saves the snapshot and opens the result. It receives only
 * text and a number; the photo itself never leaves the phone.
 */
export async function checkLabel(value: unknown): Promise<CheckLabelResult> {
  const parsed = parseLabelCheckInput(value);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login?next=/scan/label");

  const bundle = await loadOwnProfile(supabase);
  if (!bundle || bundle.profile.onboarding_completed_at === null) redirect("/onboarding");

  const { input } = parsed;
  const result = checkLabelText(input, bundle.allergens);
  const row = toLabelScanInsert({
    profileId: bundle.profile.id,
    text: input.text,
    ocrText: input.ocrText,
    ocrConfidence: input.ocrConfidence,
    result,
  });
  const { data: saved, error } = await supabase.from("scans").insert(row).select("id").single();
  if (error || !saved) {
    console.error("Could not save label scan", error);
    return { error: "We checked the label but couldn't save the result. Try again." };
  }
  redirect(`/scans/${saved.id}`);
}
