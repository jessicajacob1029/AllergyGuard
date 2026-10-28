"use server";

import { redirect } from "next/navigation";
import { checkLabelText, parseLabelCheckInput } from "@/lib/ocr/check-label";
import { toLabelScanInsert, toPasteScanInsert } from "@/lib/products/scan-record";
import { loadOwnProfile } from "@/lib/profile/load";
import { createClient } from "@/lib/supabase/server";

export type CheckLabelResult = { error: string };

/**
 * Checks the text from a label photo or pasted text with checkAllergens()
 * (via checkLabelText), saves the snapshot and opens the result. It receives
 * only text (and the photo's confidence); a photo never leaves the phone.
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
  const profileId = bundle.profile.id;
  const row =
    input.source === "photo"
      ? toLabelScanInsert({
          profileId,
          text: input.text,
          ocrText: input.ocrText,
          ocrConfidence: input.ocrConfidence,
          result,
        })
      : toPasteScanInsert({ profileId, text: input.text, result });
  const { data: saved, error } = await supabase.from("scans").insert(row).select("id").single();
  if (error || !saved) {
    console.error("Could not save label scan", error);
    return { error: "We checked the label but couldn't save the result. Try again." };
  }
  redirect(`/scans/${saved.id}`);
}
