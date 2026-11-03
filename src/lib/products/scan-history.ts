// Saved scans with the verdict to show TODAY (Scan history, "Latest scans" on
// Home). A scan checked before an allergen was added is re-checked from its
// saved ingredients with the current allergies (currentVerdict()), so a stale
// "Safe" is never shown. Reads only, through the caller's client (RLS applies).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Verdict } from "@/lib/allergen/check";
import { loadAllergens } from "@/lib/profile/load";
import { readScanListRows, SCAN_LIST_COLUMNS, type ScanListRow } from "./scan-list";
import { currentVerdict, loadAllergiesChangedAt, matchesVerdictFilter, type CurrentVerdict } from "./stale-result";

const INPUT_COLUMNS = "ingredients_text, declared_allergens, declared_traces, data_notes";

export type ScanWithCurrent = ScanListRow & { current: CurrentVerdict };

type Inputs = {
  ingredients_text: string | null;
  declared_allergens: string[] | null;
  declared_traces: string[] | null;
  data_notes: string[] | null;
};

/**
 * Newest first. The verdict filter uses the CURRENT verdict, so it's applied
 * here after the re-check, over the latest `scanWindow` scans.
 */
export async function loadScansWithCurrentVerdict(
  supabase: SupabaseClient,
  profileId: string,
  { verdict = null, limit, scanWindow = limit }: { verdict?: Verdict | null; limit: number; scanWindow?: number },
): Promise<ScanWithCurrent[]> {
  const [{ data, error }, allergiesChangedAt, allergens] = await Promise.all([
    supabase
      .from("scans")
      .select(`${SCAN_LIST_COLUMNS}, ${INPUT_COLUMNS}`)
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(Math.max(limit, scanWindow)),
    loadAllergiesChangedAt(supabase, profileId),
    loadAllergens(supabase, profileId),
  ]);
  if (error) throw error;
  const raw = (data ?? []) as Record<string, unknown>[];
  const inputsById = new Map(raw.map((r) => [r.id, r as unknown as Inputs]));
  return readScanListRows(raw)
    .map((row) => {
      const inputs = inputsById.get(row.id);
      const current = currentVerdict(
        {
          ...row,
          product_found: row.product_found ?? true,
          ingredients_text: inputs?.ingredients_text ?? null,
          declared_allergens: inputs?.declared_allergens ?? [],
          declared_traces: inputs?.declared_traces ?? [],
          data_notes: inputs?.data_notes ?? [],
        },
        allergiesChangedAt,
        allergens,
      );
      return { ...row, current };
    })
    .filter((row) => matchesVerdictFilter(row.current.shown, verdict))
    .slice(0, limit);
}
