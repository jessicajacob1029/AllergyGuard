import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MedicationRow } from "@/lib/profile/types";
import { localDate, medicationAlerts, whenText } from "./alerts";
import { DEFAULT_REMINDER_SETTINGS, loadReminderSettings, saveReminderSettings } from "./settings";

const med = (id: string, expiry_date: string | null): MedicationRow => ({ id, name: id, dose: null, expiry_date });

describe("medicationAlerts", () => {
  const today = "2026-11-01";

  it("splits expired from expiring within 30 days, and ignores the rest", () => {
    const { expired, soon } = medicationAlerts(
      [med("none", null), med("far", "2026-12-02"), med("in30", "2026-12-01"), med("today", "2026-11-01"), med("yesterday", "2026-10-31"), med("old", "2026-01-01"), med("in5", "2026-11-06")],
      today,
    );
    expect(expired.map((a) => [a.medication.id, a.daysLeft])).toEqual([["old", -304], ["yesterday", -1]]);
    expect(soon.map((a) => [a.medication.id, a.daysLeft])).toEqual([["today", 0], ["in5", 5], ["in30", 30]]);
  });

  it("ignores dates it can't read", () => {
    expect(medicationAlerts([med("bad", "soon"), med("empty", "")], today)).toEqual({ expired: [], soon: [] });
  });

  it("counts the expiry date as 'today', not expired (same as the emergency card)", () => {
    expect(medicationAlerts([med("a", "2026-11-01")], today).expired).toEqual([]);
  });
});

describe("localDate / whenText", () => {
  it("uses the phone's calendar date, not UTC", () => {
    // 00:30 on 2 Nov in the phone's zone (whatever the test machine's zone is).
    expect(localDate(new Date(2026, 10, 2, 0, 30))).toBe("2026-11-02");
    expect(localDate(new Date(2026, 10, 1, 23, 59))).toBe("2026-11-01");
  });

  it("says when", () => {
    expect([0, 1, 5].map(whenText)).toEqual(["today", "tomorrow", "in 5 days"]);
  });
});

/** A tiny stand-in for the Supabase query builder: records calls, returns queued results. */
function fakeSupabase(results: unknown[]) {
  const calls: string[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "update", "insert"]) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push(`${method}(${JSON.stringify(args)})`);
      return builder;
    });
  }
  builder.maybeSingle = vi.fn(async () => results.shift());
  builder.then = (resolve: (v: unknown) => void) => resolve(results.shift());
  const client = { from: vi.fn(() => builder) } as unknown as SupabaseClient;
  return { client, calls };
}

describe("reminder settings", () => {
  it("defaults to email on, push off, product change alerts on when there's no row", async () => {
    const { client } = fakeSupabase([{ data: null, error: null }]);
    expect(await loadReminderSettings(client, "u1")).toEqual(DEFAULT_REMINDER_SETTINGS);
    expect(DEFAULT_REMINDER_SETTINGS).toEqual({ pushEnabled: false, emailEnabled: true, productAlertsEnabled: true });
  });

  it("reads a saved row", async () => {
    const { client } = fakeSupabase([
      { data: { push_enabled: true, email_enabled: false, product_alerts_enabled: false }, error: null },
    ]);
    expect(await loadReminderSettings(client, "u1")).toEqual({ pushEnabled: true, emailEnabled: false, productAlertsEnabled: false });
  });

  it("updates an existing row, without touching owner_id", async () => {
    const { client, calls } = fakeSupabase([{ data: [{ owner_id: "u1" }], error: null }]);
    expect(await saveReminderSettings(client, "u1", { pushEnabled: true, emailEnabled: false, productAlertsEnabled: true })).toEqual({ ok: true });
    expect(calls[0]).toBe('update([{"push_enabled":true,"email_enabled":false,"product_alerts_enabled":true}])');
    expect(calls.some((c) => c.startsWith("insert"))).toBe(false);
  });

  it("inserts the row the first time", async () => {
    const { client, calls } = fakeSupabase([{ data: [], error: null }, { error: null }]);
    expect(await saveReminderSettings(client, "u1", { pushEnabled: false, emailEnabled: false, productAlertsEnabled: false })).toEqual({ ok: true });
    expect(calls).toContain('insert([{"owner_id":"u1","push_enabled":false,"email_enabled":false,"product_alerts_enabled":false}])');
  });

  it("reports a failed save", async () => {
    const { client } = fakeSupabase([{ data: null, error: { message: "offline" } }]);
    const result = await saveReminderSettings(client, "u1", DEFAULT_REMINDER_SETTINGS);
    expect(result.ok).toBe(false);
  });
});
