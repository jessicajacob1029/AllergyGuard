// Phase 8 in the app: watched products and product change alerts. Reads go
// through the caller's Supabase client, so RLS limits them to the user's own
// rows. The weekly check itself is the product-alerts Edge Function.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Verdict } from "@/lib/allergen/check";
import { SCAN_VERDICTS } from "./scan-record";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Products scanned longer ago than this aren't re-checked (the database uses the same 6 months). */
export const WATCH_MONTHS = 6;

export type WatchCheckStatus =
  | "unchanged"
  | "changed"
  | "improved"
  | "alerted"
  | "held"
  | "not_found"
  | "no_ingredients"
  | "data_incomplete";

export type Watch = {
  id: string;
  watching: boolean;
  lastScannedAt: string;
  lastCheckedAt: string | null;
  lastCheckStatus: WatchCheckStatus | null;
};

export type AlertListItem = {
  id: string;
  barcode: string;
  productName: string | null;
  summary: string;
  newVerdict: Verdict;
  createdAt: string;
};

const isVerdict = (v: unknown): v is Verdict => typeof v === "string" && (SCAN_VERDICTS as readonly string[]).includes(v);

/** The watch for one product on this profile, or null (not watched, e.g. not on Open Food Facts). */
export async function loadWatch(supabase: SupabaseClient, profileId: string, barcode: string): Promise<Watch | null> {
  const { data, error } = await supabase
    .from("watched_products")
    .select("id, watching, last_scanned_at, last_checked_at, last_check_status")
    .eq("profile_id", profileId)
    .eq("barcode", barcode)
    .maybeSingle<{
      id: string;
      watching: boolean;
      last_scanned_at: string;
      last_checked_at: string | null;
      last_check_status: WatchCheckStatus | null;
    }>();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    watching: data.watching,
    lastScannedAt: data.last_scanned_at,
    lastCheckedAt: data.last_checked_at,
    lastCheckStatus: data.last_check_status,
  };
}

/** Alerts the user hasn't opened yet, newest first: the Scan history banner and badges. */
export async function loadUnseenAlerts(supabase: SupabaseClient, profileId: string): Promise<AlertListItem[]> {
  const { data, error } = await supabase
    .from("product_alerts")
    .select("id, barcode, product_name, summary, new_verdict, created_at")
    .eq("profile_id", profileId)
    .is("seen_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []).flatMap((r: Record<string, unknown>) =>
    typeof r.id === "string" && typeof r.barcode === "string" && typeof r.summary === "string" && isVerdict(r.new_verdict) && typeof r.created_at === "string"
      ? [
          {
            id: r.id,
            barcode: r.barcode,
            productName: typeof r.product_name === "string" ? r.product_name : null,
            summary: r.summary,
            newVerdict: r.new_verdict,
            createdAt: r.created_at,
          },
        ]
      : [],
  );
}

/** True when the product was scanned within the last 6 months, so the weekly check still covers it. */
export function isRecentlyScanned(lastScannedAt: string, now: Date = new Date()): boolean {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - WATCH_MONTHS);
  return new Date(lastScannedAt).getTime() > cutoff.getTime();
}

/** A short note about the last weekly check, for the scan result. Null when there's nothing to say. */
export function watchNote(watch: Watch, now: Date = new Date()): string | null {
  if (!watch.watching) return null;
  if (!isRecentlyScanned(watch.lastScannedAt, now)) {
    return "You scanned this more than 6 months ago, so we've stopped re-checking it. Scan it again to keep watching.";
  }
  switch (watch.lastCheckStatus) {
    case "not_found":
      return "Open Food Facts no longer has this product. Check the packet.";
    case "no_ingredients":
      return "Open Food Facts has no ingredient list for this product right now. Check the packet.";
    case "data_incomplete":
      return "Open Food Facts now says this product's data may be incomplete. Check the packet.";
    default:
      return null;
  }
}

/** "Product name" for an alert, falling back to the barcode. */
export function alertProductLabel(a: { productName: string | null; barcode: string }): string {
  return a.productName?.trim() || `Product ${a.barcode}`;
}
