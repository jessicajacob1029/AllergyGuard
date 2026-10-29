// Lists of saved scans (scan history, "Latest scans" on home). Pure apart from
// loadScans, which only reads through the caller's Supabase client (RLS applies).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Verdict } from "@/lib/allergen/check";
import { SCAN_VERDICTS } from "./scan-record";
import type { ScanLabelRow } from "./scan-label";

export const SCAN_LIST_COLUMNS = "id, input, barcode, product_name, brands, verdict, created_at";

export type ScanListRow = ScanLabelRow & { id: string; verdict: Verdict; created_at: string };

/** Filters on /scans, in display order. `null` means All. */
export const VERDICT_FILTERS: readonly { value: Verdict | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "safe", label: "Safe" },
  { value: "caution", label: "Caution" },
  { value: "unsafe", label: "Unsafe" },
];

/** `?verdict=` from the URL. Anything else (missing, misspelt, a list) means All. */
export function parseVerdictFilter(value: string | string[] | undefined): Verdict | null {
  return typeof value === "string" && (SCAN_VERDICTS as readonly string[]).includes(value) ? (value as Verdict) : null;
}

const str = (v: unknown) => (typeof v === "string" ? v : null);

/** Rows from the database, skipping any with a missing id, verdict or time. */
export function readScanListRows(rows: readonly Record<string, unknown>[]): ScanListRow[] {
  return rows.flatMap((r) => {
    const verdict = r.verdict;
    if (typeof r.id !== "string" || typeof r.created_at !== "string") return [];
    if (typeof verdict !== "string" || !(SCAN_VERDICTS as readonly string[]).includes(verdict)) return [];
    return [
      {
        id: r.id,
        input: str(r.input) ?? "manual",
        barcode: str(r.barcode),
        product_name: str(r.product_name),
        brands: str(r.brands),
        verdict: verdict as Verdict,
        created_at: r.created_at,
      },
    ];
  });
}

/** Newest first, optionally only one verdict. */
export async function loadScans(
  supabase: SupabaseClient,
  profileId: string,
  { verdict = null, limit }: { verdict?: Verdict | null; limit: number },
): Promise<ScanListRow[]> {
  let query = supabase.from("scans").select(SCAN_LIST_COLUMNS).eq("profile_id", profileId);
  if (verdict) query = query.eq("verdict", verdict);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return readScanListRows(data ?? []);
}
