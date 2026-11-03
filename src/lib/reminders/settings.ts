// Reminder and alert settings for the signed-in account (table reminder_settings).
// A missing row means the defaults: email on, push off, product change alerts on.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ReminderSettings = {
  pushEnabled: boolean;
  emailEnabled: boolean;
  /** Phase 8: the weekly product check may alert this account. */
  productAlertsEnabled: boolean;
};

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  pushEnabled: false,
  emailEnabled: true,
  productAlertsEnabled: true,
};

type Row = { push_enabled: boolean; email_enabled: boolean; product_alerts_enabled: boolean };

export async function loadReminderSettings(supabase: SupabaseClient, ownerId: string): Promise<ReminderSettings> {
  const { data, error } = await supabase
    .from("reminder_settings")
    .select("push_enabled, email_enabled, product_alerts_enabled")
    .eq("owner_id", ownerId)
    .maybeSingle<Row>();
  if (error) throw error;
  return data
    ? { pushEnabled: data.push_enabled, emailEnabled: data.email_enabled, productAlertsEnabled: data.product_alerts_enabled }
    : DEFAULT_REMINDER_SETTINGS;
}

/**
 * Saves the switches. Update first, insert if there's no row yet: an upsert
 * would also try to update owner_id, which the database doesn't allow.
 */
export async function saveReminderSettings(
  supabase: SupabaseClient,
  ownerId: string,
  settings: ReminderSettings,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const values = {
    push_enabled: settings.pushEnabled,
    email_enabled: settings.emailEnabled,
    product_alerts_enabled: settings.productAlertsEnabled,
  };
  const updated = await supabase.from("reminder_settings").update(values).eq("owner_id", ownerId).select("owner_id");
  if (!updated.error && updated.data && updated.data.length > 0) return { ok: true };
  if (!updated.error) {
    const inserted = await supabase.from("reminder_settings").insert({ owner_id: ownerId, ...values });
    if (!inserted.error) return { ok: true };
  }
  return { ok: false, error: "Couldn't save your settings. Check your connection and try again." };
}
