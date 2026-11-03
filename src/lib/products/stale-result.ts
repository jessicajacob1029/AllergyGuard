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
import { checkAllergens, type CheckAllergen, type CheckResult, type Verdict } from "@/lib/allergen/check";

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

/** What a list shows for a scan: its verdict, or "Re-check needed" when it's out of date and can't be re-checked. */
export type DisplayVerdict = Verdict | "recheck_needed";

export type CurrentVerdict = {
  /** The pill to show: the current verdict whenever it can be worked out. */
  shown: DisplayVerdict;
  /** The verdict saved with the scan ("At the time of scanning"). */
  saved: Verdict;
  /** An allergen was added after this check. */
  outOfDate: boolean;
};

/**
 * Whether new allergies can make this scan out of date. A barcode Open Food
 * Facts didn't have is Caution whatever the allergies; everything else
 * (found products, label photos, pasted text) can be.
 */
export function canBeOutOfDate(scan: Pick<SavedScanInputs, "barcode" | "product_found">): boolean {
  return !(scan.barcode && scan.product_found === false);
}

/**
 * The verdict to show for a saved scan today. Up to date → the saved verdict.
 * Out of date → checkAllergens() again on the saved ingredients with the
 * current allergies (no new lookup, nothing saved), or "recheck_needed" for a
 * label photo / pasted text, which can't be re-checked from saved data.
 */
export function currentVerdict(
  scan: SavedScanInputs & { verdict: Verdict; created_at: string },
  allergiesChangedAt: string | null,
  allergens: readonly CheckAllergen[],
): CurrentVerdict {
  const outOfDate = canBeOutOfDate(scan) && isOutOfDate(scan.created_at, allergiesChangedAt);
  if (!outOfDate) return { shown: scan.verdict, saved: scan.verdict, outOfDate };
  if (!canRecheck(scan)) return { shown: "recheck_needed", saved: scan.verdict, outOfDate };
  return { shown: recheckScan(scan, allergens).verdict, saved: scan.verdict, outOfDate };
}

/** Safe / Caution / Unsafe filters use the current verdict. "Re-check needed" is never Safe: it's listed under Caution. */
export function matchesVerdictFilter(shown: DisplayVerdict, filter: Verdict | null): boolean {
  if (filter === null) return true;
  return shown === "recheck_needed" ? filter === "caution" : shown === filter;
}
