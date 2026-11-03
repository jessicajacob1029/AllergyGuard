// Phase 8: ingredient change alerts. Called by pg_cron (Sunday 08:30 IST for
// the check, daily 08:35 IST for retries) with the cron secret; rejects every
// request without it. The logic lives in ../_shared/run-product-alerts.ts
// (tested with Vitest); this file only connects it to the database, Open Food
// Facts, web push and Resend. Verdicts come from the app's own
// checkAllergens() (src/lib/allergen/check.ts), imported, never copied.
//
// Body (all optional, JSON):
//   { "retryOnly": true }   resend failed alerts only (no Open Food Facts requests)
//   { "dryRun": true }      ask Open Food Facts and report; writes and sends nothing
//   { "onlyEmail": "…" }    one account only (testing; the schedules never send it)
//   { "force": true }       ignore "checked in the last 6 days" (testing)
//   { "limit": 60 }         at most this many products (1 to 60)
//   { "selfCheck": true }   prove the function, checkAllergens() and VAPID load; sends nothing
//
// Secrets: the same as medication-reminders (CRON_SECRET, VAPID_*, RESEND_API_KEY,
// REMINDER_FROM, APP_URL). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY come from Supabase.

import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import webpush from "npm:web-push@3.6.7";
import type { CheckAllergen, CheckResult, Verdict } from "../../../src/lib/allergen/check.ts";
import { CONTACT_EMAIL, fetchProduct, USER_AGENT, type Product } from "../../../src/lib/products/open-food-facts.ts";
import { checkVersion } from "../_shared/product-change.ts";
import { escapeHtml } from "../_shared/reminder-email.ts";
import {
  runProductAlertRetries,
  runProductCheck,
  type DueWatch,
  type ProductAlertDeps,
  type ProductCheckReport,
  type RetryAlert,
} from "../_shared/run-product-alerts.ts";
import { secretsMatch } from "../_shared/run-reminders.ts";

const REQUIRED = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "RESEND_API_KEY", "REMINDER_FROM", "APP_URL"];
const MAX_LIMIT = 60;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json" } });

type DueRow = {
  watch_id: string;
  profile_id: string;
  owner_id: string;
  barcode: string;
  product_name: string | null;
  brands: string | null;
  snap_ingredients_text: string | null;
  snap_declared_allergens: string[] | null;
  snap_declared_traces: string[] | null;
  snap_incomplete: boolean;
  allergens: CheckAllergen[] | null;
  email: string | null;
  email_enabled: boolean;
  push_enabled: boolean;
  unsubscribe_token: string;
};

type RetryRow = {
  alert_id: string;
  owner_id: string;
  product_name: string | null;
  barcode: string;
  old_verdict: Verdict;
  new_verdict: Verdict;
  summary: string;
  result: Partial<CheckResult> | null;
  email: string | null;
  email_enabled: boolean;
  push_enabled: boolean;
  unsubscribe_token: string;
};

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Same request as the scan page. The `cache` option is dropped: it means
// nothing on the server and not every runtime accepts it.
const offFetch: typeof fetch = (input, init) => {
  const { cache: _cache, ...rest } = init ?? {};
  return fetch(input, rest);
};

Deno.serve(async (req: Request) => {
  // Checked first: nothing else runs, or is revealed, without the cron secret.
  if (!secretsMatch(req.headers.get("x-cron-secret"), Deno.env.get("CRON_SECRET"))) {
    return json({ error: "Forbidden" }, 403);
  }
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const missing = REQUIRED.filter((name) => !Deno.env.get(name));
  if (missing.length) return json({ error: "Missing secrets", missing }, 500);

  let body: { retryOnly?: unknown; dryRun?: unknown; onlyEmail?: unknown; force?: unknown; limit?: unknown; selfCheck?: unknown } = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const onlyEmail = typeof body.onlyEmail === "string" && body.onlyEmail.includes("@") ? body.onlyEmail : null;
  if (body.onlyEmail !== undefined && !onlyEmail) return json({ error: "onlyEmail must be an email address" }, 400);
  const limit = typeof body.limit === "number" && Number.isInteger(body.limit) ? Math.min(Math.max(body.limit, 1), MAX_LIMIT) : MAX_LIMIT;
  const dryRun = body.dryRun === true;
  const force = body.force === true;

  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

  if (body.selfCheck === true) {
    // Proves the shared app files load here: the one checkAllergens().
    const verdict = checkVersion(
      { ingredientsText: "sugar, whey powder", contains: [], mayContain: [], incomplete: false },
      [{ kind: "predefined", code: "milk" }],
    ).verdict;
    return json({ ok: verdict === "unsafe", checkAllergens: verdict, userAgent: USER_AGENT });
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const appUrl = Deno.env.get("APP_URL")!.replace(/\/+$/, "");

  async function sendEmail(to: string, email: { subject: string; text: string; html: string; headers?: Record<string, string> }) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: Deno.env.get("REMINDER_FROM"), to: [to], ...email }),
    });
    if (res.ok) return { ok: true as const };
    return { ok: false as const, message: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
  }

  const deps: ProductAlertDeps = {
    appUrl,

    async loadDue() {
      const { data, error } = await db.rpc("due_product_checks", { p_limit: limit, p_only_email: onlyEmail, p_force: force });
      if (error) throw new Error(`due_product_checks: ${error.message}`);
      return (data as DueRow[]).map(
        (r): DueWatch => ({
          watchId: r.watch_id,
          profileId: r.profile_id,
          ownerId: r.owner_id,
          barcode: r.barcode,
          productName: r.product_name,
          brands: r.brands,
          snapshot: {
            ingredientsText: r.snap_ingredients_text,
            contains: r.snap_declared_allergens ?? [],
            mayContain: r.snap_declared_traces ?? [],
            incomplete: r.snap_incomplete,
          },
          allergens: r.allergens ?? [],
          email: r.email,
          emailEnabled: r.email_enabled,
          pushEnabled: r.push_enabled,
          unsubscribeToken: r.unsubscribe_token,
        }),
      );
    },

    fetchProduct: (barcode) => fetchProduct(barcode, { fetchImpl: offFetch }),

    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

    async recordCheck(watchId, status, product?: Product) {
      const update: Record<string, unknown> = { last_checked_at: new Date().toISOString(), last_check_status: status };
      if (product) {
        Object.assign(update, {
          product_name: product.name,
          brands: product.brands,
          snap_ingredients_text: product.ingredientsText,
          snap_declared_allergens: product.declared.contains,
          snap_declared_traces: product.declared.mayContain,
          snap_incomplete: product.incomplete,
          snap_off_last_modified: product.lastModified,
          snap_updated_at: new Date().toISOString(),
        });
      }
      const { error } = await db.from("watched_products").update(update).eq("id", watchId);
      if (error) console.error("recordCheck", watchId, error.message);
    },

    async claimAlert(row) {
      const { data, error } = await db.rpc("claim_product_alert", { p_alert: row });
      if (error) throw new Error(`claim_product_alert: ${error.message}`);
      return (data as string | null) ?? null;
    },

    async recordAlert(id, { push, email, delivered }) {
      const { error } = await db
        .from("product_alerts")
        .update({ push_result: push, email_result: email, status: delivered ? "delivered" : "failed" })
        .eq("id", id);
      if (error) console.error("recordAlert", id, error.message);
    },

    async loadRetries() {
      const { data, error } = await db.rpc("product_alerts_to_retry", { p_only_email: onlyEmail });
      if (error) throw new Error(`product_alerts_to_retry: ${error.message}`);
      return (data as RetryRow[]).map(
        (r): RetryAlert => ({
          alertId: r.alert_id,
          ownerId: r.owner_id,
          productName: r.product_name,
          barcode: r.barcode,
          oldVerdict: r.old_verdict,
          newVerdict: r.new_verdict,
          summary: r.summary,
          explanation: typeof r.result?.explanation === "string" ? r.result.explanation : "",
          email: r.email,
          emailEnabled: r.email_enabled,
          pushEnabled: r.push_enabled,
          unsubscribeToken: r.unsubscribe_token,
        }),
      );
    },

    async claimRetry(id) {
      const { data, error } = await db.rpc("claim_product_alert_retry", { p_alert_id: id });
      if (error) throw new Error(`claim_product_alert_retry: ${error.message}`);
      return data !== null;
    },

    async loadDevices(ownerId) {
      const { data, error } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth:auth_key").eq("owner_id", ownerId);
      if (error) throw new Error(`push_subscriptions: ${error.message}`);
      return data ?? [];
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

    sendEmail,

    hash: sha256Hex,

    async flagHeld(report: ProductCheckReport) {
      console.error("product-alerts: safety brake held this run", JSON.stringify({ checked: report.checked, wouldAlert: report.wouldAlert }));
      const held = report.decisions.filter((d) => d.status === "held");
      const lines = [...new Set(held.map((d) => `${d.barcode}: ${d.summary ?? ""}`))].slice(0, 50);
      const subject = `AllergyGuard: product alerts held (${report.wouldAlert} of ${report.checked} products changed)`;
      const text = [
        `The weekly product check found ${report.wouldAlert} of ${report.checked} products would alert, more than the 20% limit.`,
        "That's more likely an Open Food Facts data problem than real recipe changes, so nothing was sent and the snapshots were kept.",
        "The products are checked again next week. If the changes are real, they alert then (or run the job with force).",
        "",
        ...lines,
      ].join("\n");
      const html = `<pre style="font-family:Arial,Helvetica,sans-serif;white-space:pre-wrap;">${escapeHtml(text)}</pre>`;
      const sent = await sendEmail(CONTACT_EMAIL, { subject, text, html });
      if (!sent.ok) console.error("flagHeld email", sent.message);
    },
  };

  try {
    if (body.retryOnly === true) {
      const report = await runProductAlertRetries(deps, { dryRun });
      if (!dryRun) {
        await db.from("product_check_runs").insert({ mode: "retry", one_account: onlyEmail !== null, alerted: report.delivered, details: report });
      }
      console.log(JSON.stringify({ mode: "retry", ...report }));
      return json(report);
    }

    const report = await runProductCheck(deps, { dryRun });
    const summary = {
      mode: "check",
      dryRun,
      onlyOneAccount: onlyEmail !== null,
      checked: report.checked,
      unreachable: report.unreachable.length,
      stopped: report.stopped,
      wouldAlert: report.wouldAlert,
      alerted: report.alerted,
      held: report.held,
    };
    if (!dryRun) {
      const { error } = await db.from("product_check_runs").insert({
        mode: "check",
        one_account: onlyEmail !== null,
        checked: report.checked,
        would_alert: report.wouldAlert,
        alerted: report.alerted,
        held: report.held,
        details: { unreachable: report.unreachable, stopped: report.stopped, statuses: report.decisions.map((d) => d.status) },
      });
      if (error) console.error("product_check_runs", error.message);
    }
    console.log(JSON.stringify(summary));
    return json(report);
  } catch (err) {
    console.error(err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});
