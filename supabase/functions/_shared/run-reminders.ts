// The daily reminder run, with every outside call passed in (database, web
// push, Resend), so all of it is tested with fakes. The Edge Function
// (medication-reminders/index.ts) only wires up the real clients.
// Pure TypeScript, no Deno or Node APIs.

import { daysBetween, isIsoDate } from "./ist-date.ts";
import { reminderEmail, type ReminderEmail } from "./reminder-email.ts";
import { reminderPush, type PushPayload } from "./reminder-message.ts";
import { reminderStage, type ReminderStage } from "./reminder-stage.ts";

/** One medication with an expiry date in the next 30 days, and its owner's settings. */
export type DueMedication = {
  medicationId: string;
  profileId: string;
  ownerId: string;
  name: string;
  dose: string | null;
  expiryDate: string | null;
  /** Stages already sent for this medication and this expiry date. */
  sentStages: ReminderStage[];
  /** Only set for a confirmed email address. */
  email: string | null;
  emailEnabled: boolean;
  pushEnabled: boolean;
  unsubscribeToken: string;
};

export type PushDevice = { id: string; endpoint: string; p256dh: string; auth: string };

/** `status` is the push service's HTTP status when it answered. */
export type PushOutcome = { ok: true } | { ok: false; status: number | null; message: string };
export type EmailOutcome = { ok: true } | { ok: false; message: string };

export type ReminderDeps = {
  loadDue(today: string): Promise<DueMedication[]>;
  loadDevices(ownerId: string): Promise<PushDevice[]>;
  /** Inserts the "sent" row; returns its id, or null if this reminder was already claimed. */
  claim(row: { medicationId: string; profileId: string; expiryDate: string; stage: ReminderStage }): Promise<string | null>;
  record(id: string, result: { push: string; email: string }): Promise<void>;
  sendPush(device: PushDevice, payload: PushPayload): Promise<PushOutcome>;
  deleteDevice(id: string): Promise<void>;
  sendEmail(to: string, email: ReminderEmail): Promise<EmailOutcome>;
  appUrl: string;
};

export type ReminderReport = {
  today: string;
  dryRun: boolean;
  checked: number;
  skippedNoExpiry: number;
  sent: { medicationId: string; stage: ReminderStage; daysLeft: number; push: string; email: string }[];
  alreadyClaimed: number;
  removedDevices: number;
};

/** The push service says this subscription no longer exists: delete it. */
export function isGoneStatus(status: number | null): boolean {
  return status === 404 || status === 410;
}

/** Sends one payload to each device; deletes devices the push service reports as gone. */
export async function pushToDevices(
  devices: readonly PushDevice[],
  payload: PushPayload,
  deps: Pick<ReminderDeps, "sendPush" | "deleteDevice">,
): Promise<{ delivered: number; removed: number; failed: number }> {
  let delivered = 0;
  let removed = 0;
  let failed = 0;
  for (const device of devices) {
    const outcome = await deps.sendPush(device, payload);
    if (outcome.ok) {
      delivered++;
    } else if (isGoneStatus(outcome.status)) {
      await deps.deleteDevice(device.id);
      removed++;
    } else {
      failed++;
    }
  }
  return { delivered, removed, failed };
}

export async function runReminders(
  deps: ReminderDeps,
  today: string,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<ReminderReport> {
  if (!isIsoDate(today)) throw new Error(`today must be YYYY-MM-DD, got ${today}`);
  const report: ReminderReport = { today, dryRun, checked: 0, skippedNoExpiry: 0, sent: [], alreadyClaimed: 0, removedDevices: 0 };
  const devicesByOwner = new Map<string, PushDevice[]>();

  for (const due of await deps.loadDue(today)) {
    report.checked++;
    // The query only returns dated medications; this guards against a bad row.
    if (!due.expiryDate || !isIsoDate(due.expiryDate)) {
      report.skippedNoExpiry++;
      continue;
    }
    const daysLeft = daysBetween(today, due.expiryDate);
    const stage = reminderStage(daysLeft, due.sentStages);
    if (!stage) continue;
    // Both channels off: nothing to send, and nothing is claimed, so turning one
    // back on before the window ends still gets the reminder.
    const canEmail = due.emailEnabled && due.email !== null;
    if (!due.pushEnabled && !canEmail) continue;

    if (dryRun) {
      report.sent.push({ medicationId: due.medicationId, stage, daysLeft, push: due.pushEnabled ? "would send" : "off", email: canEmail ? "if push not delivered" : "off" });
      continue;
    }

    // Claim first, send second: a reminder already claimed (an earlier or
    // parallel run) is never sent again. A send that fails stays claimed.
    const claimId = await deps.claim({ medicationId: due.medicationId, profileId: due.profileId, expiryDate: due.expiryDate, stage });
    if (!claimId) {
      report.alreadyClaimed++;
      continue;
    }

    const med = { id: due.medicationId, name: due.name, dose: due.dose, expiryDate: due.expiryDate };
    let push = "off";
    let delivered = 0;
    if (due.pushEnabled) {
      if (!devicesByOwner.has(due.ownerId)) devicesByOwner.set(due.ownerId, await deps.loadDevices(due.ownerId));
      const devices = devicesByOwner.get(due.ownerId) ?? [];
      if (devices.length === 0) {
        push = "no devices";
      } else {
        const result = await pushToDevices(devices, reminderPush(med, stage, daysLeft), deps);
        delivered = result.delivered;
        report.removedDevices += result.removed;
        push = `delivered ${result.delivered} of ${devices.length}`;
        // Don't try removed devices again for this owner's other medications.
        if (result.removed > 0) devicesByOwner.set(due.ownerId, await deps.loadDevices(due.ownerId));
      }
    }

    let email = "off";
    if (!due.emailEnabled) {
      email = "off";
    } else if (delivered > 0) {
      email = "not needed (push delivered)";
    } else if (!due.email) {
      email = "no confirmed address";
    } else {
      const outcome = await deps.sendEmail(
        due.email,
        reminderEmail({ med, stage, daysLeft, appUrl: deps.appUrl, unsubscribeToken: due.unsubscribeToken }),
      );
      email = outcome.ok ? "sent" : `failed: ${outcome.message}`.slice(0, 300);
    }

    await deps.record(claimId, { push, email });
    report.sent.push({ medicationId: due.medicationId, stage, daysLeft, push, email });
  }
  return report;
}

/** Constant-time comparison for the cron secret (no early exit on the first difference). */
export function secretsMatch(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  let diff = given.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) diff |= (given.charCodeAt(i % (given.length || 1)) ^ expected.charCodeAt(i));
  return diff === 0;
}
