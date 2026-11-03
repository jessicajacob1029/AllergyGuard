// A saved scan is checked against the allergies the user had THEN. When an
// allergen has been added to the profile since, the saved verdict may be out
// of date (a "Safe" butter before Milk was added). This finds those scans and
// re-checks one with the current allergies, from the saved ingredients only:
// no new Open Food Facts request, and the ONE checkAllergens() (CLAUDE.md).
//
// Only additions count. Saving a profile inserts rows only for new allergens
// (src/lib/profile/save.ts), so a row's created_at is when it was added.
// Removing an allergen can only make an old result more cautious than needed,
// never less safe; a severity change never changes a verdict.

import type { SupabaseClient } from "@supabase/supabase-js";
import { checkAllergens, type CheckAllergen, type CheckResult } from "@/lib/allergen/check";

export const STALE_WARNING = "Your allergies have changed since this check. This result may be out of date.";

/** When the newest of the profile's current allergens was added, or null when it has none. */
export async function loadAllergiesChangedAt(supabase: SupabaseClient, profileId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("profile_allergens")
    .select("created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ created_at: string }>();
  if (error) throw error;
  return data?.created_at ?? null;
}

/** True when an allergen was added after the check. */
export function isOutOfDate(checkedAt: string, allergiesChangedAt: string | null): boolean {
  if (!allergiesChangedAt) return false;
  const checked = Date.parse(checkedAt);
  const changed = Date.parse(allergiesChangedAt);
  return Number.isFinite(checked) && Number.isFinite(changed) && changed > checked;
}

/** What a barcode scan saved: enough to run the same check again. */
export type SavedScanInputs = {
  input: string;
  barcode: string | null;
  product_found: boolean;
  ingredients_text: string | null;
  declared_allergens: readonly string[] | null;
  declared_traces: readonly string[] | null;
  data_notes: readonly string[] | null;
};

/**
 * Barcode scans can be re-checked exactly as the scan page checked them.
 * Label photos and pasted text (Phase 5) can't: their OCR confidence isn't
 * saved here, so the user scans the label again instead. A product that wasn't
 * on Open Food Facts has nothing to re-check (it stays Caution).
 */
export function canRecheck(scan: SavedScanInputs): boolean {
  return (scan.input === "camera" || scan.input === "manual") && Boolean(scan.barcode) && scan.product_found;
}

/** The saved product data, checked with the user's current allergies (same options as /scan). */
export function recheckScan(scan: SavedScanInputs, allergens: readonly CheckAllergen[]): CheckResult {
  return checkAllergens(scan.product_found ? scan.ingredients_text : null, allergens, {
    incomplete: scan.product_found && (scan.data_notes ?? []).length > 0,
    declared: scan.product_found
      ? { contains: scan.declared_allergens ?? [], mayContain: scan.declared_traces ?? [] }
      : undefined,
  });
}
