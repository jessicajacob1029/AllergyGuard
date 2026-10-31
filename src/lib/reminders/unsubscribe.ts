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
