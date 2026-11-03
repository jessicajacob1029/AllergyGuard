// Phase 8: the weekly product check and the daily retry, with every outside
// call passed in (database, Open Food Facts, web push, Resend), so all of it is
// tested with fakes. The Edge Function (product-alerts/index.ts) only wires up
// the real clients. Pure TypeScript, no Deno or Node APIs.

import type { CheckAllergen, CheckResult, Verdict } from "../../../src/lib/allergen/check.ts";
import type { FetchResult, Product } from "../../../src/lib/products/open-food-facts.ts";
import {
  productAlertEmail,
  productAlertPush,
  type ProductAlertMessage,
} from "./product-alert-message.ts";
import { dataKey, evaluateChange, type ChangeItem, type ProductData } from "./product-change.ts";
import type { ReminderEmail } from "./reminder-email.ts";
import { pushToDevices, type EmailOutcome, type PushDevice, type PushOutcome } from "./run-reminders.ts";
import type { PushPayload } from "./reminder-message.ts";

/** Wait between two Open Food Facts requests: at most 40 a minute (their limit is 100). */
export const POLITE_DELAY_MS = 1500;
/** Stop the run after this many failed requests in a row (Open Food Facts is probably down). */
export const MAX_FAILURES_IN_A_ROW = 3;
/** Safety brake: hold every alert when more than this share of products (and at least BRAKE_MIN) would alert. */
export const BRAKE_SHARE = 0.2;
export const BRAKE_MIN = 5;

/** The owner's channels and unsubscribe token. */
export type Recipient = {
  ownerId: string;
  email: string | null;
  emailEnabled: boolean;
  pushEnabled: boolean;
  unsubscribeToken: string;
};

/** One watch due for a check, with its snapshot and the profile's allergens. */
export type DueWatch = Recipient & {
  watchId: string;
  profileId: string;
  barcode: string;
  productName: string | null;
  brands: string | null;
  snapshot: ProductData;
  allergens: CheckAllergen[];
};

export type WatchStatus =
  | "unchanged"
  | "changed"
  | "improved"
  | "alerted"
  | "held"
  | "not_found"
  | "no_ingredients"
  | "data_incomplete";

/** What claim_product_alert() stores. */
export type AlertRow = {
  watched_product_id: string;
  product_name: string | null;
  brands: string | null;
  change_key: string;
  old_verdict: Verdict;
  new_verdict: Verdict;
  changes: ChangeItem[];
  summary: string;
  result: CheckResult;
  ingredients_text: string | null;
  declared_allergens: readonly string[];
  declared_traces: readonly string[];
  data_notes: readonly string[];
  off_last_modified: string | null;
};

/** A failed alert to try again. */
export type RetryAlert = Recipient & {
  alertId: string;
  productName: string | null;
  barcode: string;
  oldVerdict: Verdict;
  newVerdict: Verdict;
  summary: string;
  explanation: string;
};

export type ProductAlertDeps = {
  loadDue(): Promise<DueWatch[]>;
  fetchProduct(barcode: string): Promise<FetchResult>;
  sleep(ms: number): Promise<void>;
  /** Records the check. With `product`, the snapshot becomes that data. */
  recordCheck(watchId: string, status: WatchStatus, product?: Product): Promise<void>;
  /** Creates the alert (status sending); null when this change was already alerted. */
  claimAlert(row: AlertRow): Promise<string | null>;
  recordAlert(id: string, result: { push: string; email: string; delivered: boolean }): Promise<void>;
  loadRetries(): Promise<RetryAlert[]>;
  /** Claims a failed alert for another attempt; false if it isn't failed any more. */
  claimRetry(id: string): Promise<boolean>;
  loadDevices(ownerId: string): Promise<PushDevice[]>;
  sendPush(device: PushDevice, payload: PushPayload): Promise<PushOutcome>;
  deleteDevice(id: string): Promise<void>;
  sendEmail(to: string, email: ReminderEmail): Promise<EmailOutcome>;
  /** SHA-256 hex. */
  hash(text: string): Promise<string>;
  /** Tells the owner that the safety brake held a run's alerts. */
  flagHeld(report: ProductCheckReport): Promise<void>;
  appUrl: string;
};

export type Decision = {
  watchId: string;
  profileId: string;
  barcode: string;
  status: WatchStatus;
  summary?: string;
  oldVerdict?: Verdict;
  newVerdict?: Verdict;
  alertId?: string | null;
  push?: string;
  email?: string;
};

export type ProductCheckReport = {
  dryRun: boolean;
  /** Barcodes Open Food Facts answered for. */
  checked: number;
  /** Barcodes it couldn't be asked about this time (checked again next run). */
  unreachable: string[];
  stopped: null | "rate_limited" | "too_many_failures";
  decisions: Decision[];
  /** Products (barcodes) with at least one alert for someone. */
  wouldAlert: number;
  alerted: number;
  held: boolean;
  removedDevices: number;
};

export type RetryReport = { dryRun: boolean; retried: number; delivered: number; failed: number; removedDevices: number };

/** The safety brake: so many changes at once more likely means Open Food Facts data broke. */
export function shouldHold(wouldAlert: number, checked: number): boolean {
  return wouldAlert >= BRAKE_MIN && checked > 0 && wouldAlert / checked > BRAKE_SHARE;
}

function latestData(product: Product): ProductData {
  return {
    ingredientsText: product.ingredientsText,
    contains: product.declared.contains,
    mayContain: product.declared.mayContain,
    incomplete: product.incomplete,
  };
}

/** Push first; email only when no push was delivered. Shared by the check and the retry. */
async function deliver(
  deps: ProductAlertDeps,
  to: Recipient,
  message: ProductAlertMessage,
  devicesByOwner: Map<string, PushDevice[]>,
): Promise<{ push: string; email: string; delivered: boolean; removed: number }> {
  let push = "off";
  let pushDelivered = 0;
  let removed = 0;
  let attempted = false;
  if (to.pushEnabled) {
    if (!devicesByOwner.has(to.ownerId)) devicesByOwner.set(to.ownerId, await deps.loadDevices(to.ownerId));
    const devices = devicesByOwner.get(to.ownerId) ?? [];
    if (devices.length === 0) {
      push = "no devices";
    } else {
      attempted = true;
      const r = await pushToDevices(devices, productAlertPush(message), deps);
      pushDelivered = r.delivered;
      removed = r.removed;
      push = `delivered ${r.delivered} of ${devices.length}`;
      if (r.removed > 0) devicesByOwner.set(to.ownerId, await deps.loadDevices(to.ownerId));
    }
  }

  let email = "off";
  let emailDelivered = false;
  if (!to.emailEnabled) {
    email = "off";
  } else if (pushDelivered > 0) {
    email = "not needed (push delivered)";
  } else if (!to.email) {
    email = "no confirmed address";
  } else {
    attempted = true;
    const outcome = await deps.sendEmail(to.email, productAlertEmail(message, deps.appUrl, to.unsubscribeToken));
    emailDelivered = outcome.ok;
    email = outcome.ok ? "sent" : `failed: ${outcome.message}`.slice(0, 300);
  }

  // With no channel to try, the in-app banner is the delivery: nothing to retry.
  const delivered = !attempted || pushDelivered > 0 || emailDelivered;
  return { push, email, delivered, removed };
}

/** The weekly check: asks Open Food Facts about each due product and alerts when it got worse for someone. */
export async function runProductCheck(
  deps: ProductAlertDeps,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<ProductCheckReport> {
  const report: ProductCheckReport = {
    dryRun,
    checked: 0,
    unreachable: [],
    stopped: null,
    decisions: [],
    wouldAlert: 0,
    alerted: 0,
    held: false,
    removedDevices: 0,
  };

  // One request per barcode, shared by every profile watching it.
  const byBarcode = new Map<string, DueWatch[]>();
  for (const w of await deps.loadDue()) {
    const list = byBarcode.get(w.barcode) ?? [];
    list.push(w);
    byBarcode.set(w.barcode, list);
  }

  type Pending = { watch: DueWatch; status: WatchStatus; product?: Product; alert?: AlertRow };
  const pending: Pending[] = [];
  const alertingBarcodes = new Set<string>();
  let failuresInARow = 0;
  let first = true;

  for (const [barcode, watches] of byBarcode) {
    if (!first) await deps.sleep(POLITE_DELAY_MS);
    first = false;

    const lookup = await deps.fetchProduct(barcode);
    if (!lookup.ok) {
      report.unreachable.push(barcode);
      if (lookup.reason === "rate_limited") {
        report.stopped = "rate_limited";
        break;
      }
      failuresInARow++;
      if (failuresInARow >= MAX_FAILURES_IN_A_ROW) {
        report.stopped = "too_many_failures";
        break;
      }
      continue;
    }
    failuresInARow = 0;
    report.checked++;

    const product = lookup.product;
    for (const watch of watches) {
      if (!product.found) {
        pending.push({ watch, status: "not_found" });
        continue;
      }
      const latest = latestData(product);
      const e = evaluateChange(watch.snapshot, latest, watch.allergens);
      if (e.outcome === "unchanged" || e.outcome === "no_ingredients" || e.outcome === "data_incomplete") {
        pending.push({ watch, status: e.outcome });
      } else if (e.outcome !== "alert") {
        pending.push({ watch, status: e.outcome, product });
      } else {
        alertingBarcodes.add(barcode);
        pending.push({
          watch,
          status: "alerted",
          product,
          alert: {
            watched_product_id: watch.watchId,
            product_name: product.name ?? watch.productName,
            brands: product.brands ?? watch.brands,
            change_key: await deps.hash(`${dataKey(latest)}|${e.after.verdict}`),
            old_verdict: e.before.verdict,
            new_verdict: e.after.verdict,
            changes: e.changes,
            summary: e.summary,
            result: e.after,
            ingredients_text: product.ingredientsText,
            declared_allergens: product.declared.contains,
            declared_traces: product.declared.mayContain,
            data_notes: product.notes,
            off_last_modified: product.lastModified,
          },
        });
      }
    }
  }

  report.wouldAlert = alertingBarcodes.size;
  report.held = shouldHold(report.wouldAlert, report.checked);

  const devicesByOwner = new Map<string, PushDevice[]>();
  for (const p of pending) {
    const status: WatchStatus = p.alert && report.held ? "held" : p.status;
    const decision: Decision = { watchId: p.watch.watchId, profileId: p.watch.profileId, barcode: p.watch.barcode, status };
    if (p.alert) {
      decision.summary = p.alert.summary;
      decision.oldVerdict = p.alert.old_verdict;
      decision.newVerdict = p.alert.new_verdict;
    }
    report.decisions.push(decision);
    if (dryRun) continue;

    if (status === "held") {
      // Snapshot kept: if the change is real, the next run sees it again.
      await deps.recordCheck(p.watch.watchId, "held");
      continue;
    }
    if (!p.alert) {
      await deps.recordCheck(p.watch.watchId, status, p.product);
      continue;
    }

    // Claim, then move the snapshot on, then send: the same change can't alert twice.
    const alertId = await deps.claimAlert(p.alert);
    await deps.recordCheck(p.watch.watchId, "alerted", p.product);
    decision.alertId = alertId;
    if (!alertId) continue; // already alerted by an earlier run

    const sent = await deliver(
      deps,
      p.watch,
      {
        alertId,
        productName: p.alert.product_name,
        barcode: p.watch.barcode,
        oldVerdict: p.alert.old_verdict,
        newVerdict: p.alert.new_verdict,
        summary: p.alert.summary,
        explanation: p.alert.result.explanation,
      },
      devicesByOwner,
    );
    await deps.recordAlert(alertId, { push: sent.push, email: sent.email, delivered: sent.delivered });
    decision.push = sent.push;
    decision.email = sent.email;
    report.removedDevices += sent.removed;
    report.alerted++;
  }

  if (report.held && !dryRun) await deps.flagHeld(report);
  return report;
}

/** The daily retry: sends failed alerts again (no Open Food Facts requests). */
export async function runProductAlertRetries(
  deps: ProductAlertDeps,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<RetryReport> {
  const report: RetryReport = { dryRun, retried: 0, delivered: 0, failed: 0, removedDevices: 0 };
  const devicesByOwner = new Map<string, PushDevice[]>();
  for (const alert of await deps.loadRetries()) {
    if (dryRun) {
      report.retried++;
      continue;
    }
    if (!(await deps.claimRetry(alert.alertId))) continue;
    report.retried++;
    const sent = await deliver(deps, alert, alert, devicesByOwner);
    await deps.recordAlert(alert.alertId, { push: sent.push, email: sent.email, delivered: sent.delivered });
    report.removedDevices += sent.removed;
    if (sent.delivered) report.delivered++;
    else report.failed++;
  }
  return report;
}
