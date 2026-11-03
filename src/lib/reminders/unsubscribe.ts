import type { SupabaseClient } from "@supabase/supabase-js";

/** Unsubscribe tokens are 32 random bytes as 64 hex characters (see the migration). */
export function isUnsubscribeToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/**
 * Turns email reminders off for the token's account. Works without logging in
 * (the database function is allowed for anonymous visitors and only changes
 * that one switch). True when a row matched.
 */
export async function unsubscribeEmail(supabase: SupabaseClient, token: string): Promise<boolean> {
  if (!isUnsubscribeToken(token)) return false;
  const { data, error } = await supabase.rpc("unsubscribe_email", { p_token: token });
  if (error) throw error;
  return data === true;
}

/** Which emails an unsubscribe link turns off. Links without `kind` are medication reminder links. */
export type UnsubscribeKind = "reminders" | "product-alerts";

export function parseUnsubscribeKind(value: unknown): UnsubscribeKind {
  return value === "product-alerts" ? "product-alerts" : "reminders";
}

/**
 * Phase 8: turns product change alerts off for the token's account (medication
 * reminders are unchanged). Works without logging in, like unsubscribeEmail().
 */
export async function unsubscribeProductAlerts(supabase: SupabaseClient, token: string): Promise<boolean> {
  if (!isUnsubscribeToken(token)) return false;
  const { data, error } = await supabase.rpc("unsubscribe_product_alerts", { p_token: token });
  if (error) throw error;
  return data === true;
}

/** Runs the right unsubscribe for the link's kind. */
export function unsubscribe(supabase: SupabaseClient, token: string, kind: UnsubscribeKind): Promise<boolean> {
  return kind === "product-alerts" ? unsubscribeProductAlerts(supabase, token) : unsubscribeEmail(supabase, token);
}
