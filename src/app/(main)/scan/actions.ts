"use server";

import { redirect } from "next/navigation";
import { checkAllergens } from "@/lib/allergen/check";
import { normalizeBarcode, validateBarcode } from "@/lib/products/barcode";
import { fetchProduct } from "@/lib/products/open-food-facts";
import { toScanInsert, type ScanInput } from "@/lib/products/scan-record";
import { loadOwnProfile } from "@/lib/profile/load";
import { createClient } from "@/lib/supabase/server";

export type CheckBarcodeResult = { error: string };

const LOOKUP_FAILED: Record<"network" | "timeout" | "bad_response" | "rate_limited", string> = {
  network: "We couldn't reach the product database. Check your connection and try again.",
  timeout: "The product database took too long to answer. Try again in a moment.",
  bad_response: "The product database had a problem answering. Try again in a moment.",
  rate_limited: "The product database is busy right now. Try again in a minute.",
};

/**
 * Looks a barcode up on Open Food Facts, checks it with checkAllergens() (the
 * one matching function), saves the snapshot and opens the result. If the
 * lookup fails nothing is saved: no data was checked, so there is no verdict.
 */
export async function checkBarcode(rawBarcode: string, input: ScanInput): Promise<CheckBarcodeResult> {
  const invalid = validateBarcode(rawBarcode);
  if (invalid) return { error: invalid };
  const barcode = normalizeBarcode(rawBarcode);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login?next=/scan");

  const bundle = await loadOwnProfile(supabase);
  if (!bundle || bundle.profile.onboarding_completed_at === null) redirect("/onboarding");

  const lookup = await fetchProduct(barcode);
  if (!lookup.ok) return { error: LOOKUP_FAILED[lookup.reason] };

  const product = lookup.product;
  const result = checkAllergens(product.found ? product.ingredientsText : null, bundle.allergens, {
    incomplete: product.found && product.incomplete,
    declared: product.found ? product.declared : undefined,
  });

  const row = toScanInsert({ profileId: bundle.profile.id, barcode, input, lookup: product, result });
  const { data: saved, error } = await supabase.from("scans").insert(row).select("id").single();
  if (error || !saved) {
    console.error("Could not save scan", error);
    return { error: "We checked the product but couldn't save the result. Try again." };
  }
  redirect(`/scans/${saved.id}`);
}
