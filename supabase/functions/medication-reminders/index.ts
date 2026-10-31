// Daily medication expiry reminders. Called by pg_cron at 08:00 IST
// (02:30 UTC) with the cron secret; rejects every request without it.
// The logic lives in ../_shared/run-reminders.ts (tested with Vitest); this
// file only connects it to the database, web push and Resend.
//
// Body (all optional, JSON): { "today": "YYYY-MM-DD", "dryRun": true, "selfCheck": true }
// - today: pretend it's another IST date (for testing); default: today in IST.
// - dryRun: list what would be sent; claims and sends nothing.
// - selfCheck: encrypt and sign a push message for a throwaway subscription
//   (proves web-push and the VAPID keys work here) and send nothing.
//
// Secrets (Supabase → Edge Functions → Secrets): CRON_SECRET, VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT, RESEND_API_KEY, REMINDER_FROM, APP_URL.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import webpush from "npm:web-push@3.6.7";
import { isIsoDate, istDate } from "../_shared/ist-date.ts";
import type { ReminderStage } from "../_shared/reminder-stage.ts";
import { runReminders, secretsMatch, type DueMedication, type ReminderDeps } from "../_shared/run-reminders.ts";

const REQUIRED = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "RESEND_API_KEY", "REMINDER_FROM", "APP_URL"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json" } });

type DueRow = {
  medication_id: string;
  profile_id: string;
  owner_id: string;
  name: string;
  dose: string | null;
  expiry_date: string | null;
  sent_stages: ReminderStage[] | null;
  email: string | null;
  email_enabled: boolean;
  push_enabled: boolean;
  unsubscribe_token: string;
};

Deno.serve(async (req: Request) => {
  // Checked first: nothing else runs, or is revealed, without the cron secret.
  if (!secretsMatch(req.headers.get("x-cron-secret"), Deno.env.get("CRON_SECRET"))) {
    return json({ error: "Forbidden" }, 403);
  }
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const missing = REQUIRED.filter((name) => !Deno.env.get(name));
  if (missing.length) return json({ error: "Missing secrets", missing }, 500);

  let body: { today?: unknown; dryRun?: unknown; selfCheck?: unknown } = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const today = body.today === undefined ? istDate(new Date()) : String(body.today);
  if (!isIsoDate(today)) return json({ error: "today must be YYYY-MM-DD" }, 400);

  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

  if (body.selfCheck === true) return json(await selfCheck());

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const deps: ReminderDeps = {
    appUrl: Deno.env.get("APP_URL")!.replace(/\/+$/, ""),

    async loadDue(day) {
      const { data, error } = await db.rpc("due_medication_reminders", { p_today: day });
      if (error) throw new Error(`due_medication_reminders: ${error.message}`);
      return (data as DueRow[]).map(
        (r): DueMedication => ({
          medicationId: r.medication_id,
          profileId: r.profile_id,
          ownerId: r.owner_id,
          name: r.name,
          dose: r.dose,
          expiryDate: r.expiry_date,
          sentStages: r.sent_stages ?? [],
          email: r.email,
          emailEnabled: r.email_enabled,
          pushEnabled: r.push_enabled,
          unsubscribeToken: r.unsubscribe_token,
        }),
      );
    },

    async loadDevices(ownerId) {
      const { data, error } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth:auth_key").eq("owner_id", ownerId);
      if (error) throw new Error(`push_subscriptions: ${error.message}`);
      return data ?? [];
    },

    async claim({ medicationId, profileId, expiryDate, stage }) {
      const { data, error } = await db
        .from("medication_reminders")
        .upsert(
          { medication_id: medicationId, profile_id: profileId, expiry_date: expiryDate, stage },
          { onConflict: "medication_id,expiry_date,stage", ignoreDuplicates: true },
        )
        .select("id");
      if (error) throw new Error(`claim: ${error.message}`);
      return data?.[0]?.id ?? null;
    },

    async record(id, { push, email }) {
      const { error } = await db.from("medication_reminders").update({ push_result: push, email_result: email }).eq("id", id);
      if (error) console.error("record", id, error.message);
    },

    async sendPush(device, payload) {
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          JSON.stringify(payload),
          { TTL: 24 * 60 * 60, urgency: "normal" },
        );
        return { ok: true };
      } catch (err) {
        const e = err as { statusCode?: number; body?: string; message?: string };
        return { ok: false, status: e.statusCode ?? null, message: String(e.body || e.message || err).slice(0, 200) };
      }
    },

    async deleteDevice(id) {
      const { error } = await db.from("push_subscriptions").delete().eq("id", id);
      if (error) console.error("deleteDevice", id, error.message);
    },

    async sendEmail(to, email) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: Deno.env.get("REMINDER_FROM"),
          to: [to],
          subject: email.subject,
          text: email.text,
          html: email.html,
          headers: email.headers,
        }),
      });
      if (res.ok) return { ok: true };
      return { ok: false, message: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
    },
  };

  try {
    const report = await runReminders(deps, today, { dryRun: body.dryRun === true });
    console.log(JSON.stringify({ today: report.today, dryRun: report.dryRun, checked: report.checked, sent: report.sent.length, alreadyClaimed: report.alreadyClaimed, removedDevices: report.removedDevices }));
    return json(report);
  } catch (err) {
    console.error(err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});

/** Encrypts and signs a push message for a throwaway subscription; sends nothing. */
async function selfCheck() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const details = webpush.generateRequestDetails(
    { endpoint: "https://push.example.invalid/self-check", keys: { p256dh: b64url(raw), auth: b64url(crypto.getRandomValues(new Uint8Array(16))) } },
    JSON.stringify({ title: "Self-check", body: "Not sent", tag: "self-check", url: "/" }),
    { TTL: 60 },
  );
  const headers = details.headers as Record<string, string>;
  return {
    ok: true,
    encryptedBytes: (details.body as Uint8Array).length,
    encoding: headers["Content-Encoding"],
    vapidSigned: String(headers.Authorization ?? "").startsWith("vapid t="),
  };
}
