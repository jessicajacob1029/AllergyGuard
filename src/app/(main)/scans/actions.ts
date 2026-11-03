"use server";

// Phase 8: "Stop watching" / "Watch for changes" on a scan result, and marking
// a product change alert as seen. Both run as the signed-in user, so RLS
// limits them to the user's own rows, and the database only lets users change
// `watching` and `seen_at` (column grants).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UUID } from "@/lib/products/product-alerts";
import { createClient } from "@/lib/supabase/server";

export type WatchActionState = { error: string | null };

export async function setWatching(_prev: WatchActionState, formData: FormData): Promise<WatchActionState> {
  const watchId = formData.get("watchId");
  const scanId = formData.get("scanId");
  const watching = formData.get("watching");
  if (typeof watchId !== "string" || !UUID.test(watchId)) return { error: "Something went wrong. Reload the page." };
  if (typeof scanId !== "string" || !UUID.test(scanId)) return { error: "Something went wrong. Reload the page." };
  if (watching !== "true" && watching !== "false") return { error: "Something went wrong. Reload the page." };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(`/login?next=/scans/${scanId}`);

  const { data: rows, error } = await supabase
    .from("watched_products")
    .update({ watching: watching === "true" })
    .eq("id", watchId)
    .select("id");
  if (error || !rows || rows.length === 0) {
    return { error: "Couldn't save that. Check your connection and try again." };
  }
  revalidatePath(`/scans/${scanId}`);
  return { error: null };
}

/** Called once by the change page after it has shown the alert. */
export async function markAlertSeen(alertId: string): Promise<void> {
  if (typeof alertId !== "string" || !UUID.test(alertId)) return;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return;
  await supabase.from("product_alerts").update({ seen_at: new Date().toISOString() }).eq("id", alertId).is("seen_at", null);
  revalidatePath("/scans");
}
