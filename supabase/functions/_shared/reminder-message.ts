// The words of a reminder: one source for the push notification and the email.
// Pure functions, no Deno or Node APIs.

import type { ReminderStage } from "./reminder-stage.ts";

export type ReminderMedication = { name: string; dose: string | null; expiryDate: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-08" → "8 Nov 2026". Dates are calendar dates, so no time zone is involved. */
export function formatExpiry(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "EpiPen 0.3 mg", or just the name when there's no dose. */
export function medicationLabel(med: ReminderMedication): string {
  return med.dose ? `${med.name} ${med.dose}` : med.name;
}

/** Short headline, used as the notification body and the email subject. */
export function reminderHeadline(med: ReminderMedication, stage: ReminderStage, daysLeft: number): string {
  switch (stage) {
    case "today":
      return `Your ${med.name} expires today`;
    case "1d":
      return `Your ${med.name} expires tomorrow`;
    default:
      return `Your ${med.name} expires in ${daysLeft} days`;
  }
}

/** One or two plain sentences under the headline. */
export function reminderDetail(med: ReminderMedication, stage: ReminderStage): string {
  const when = `${medicationLabel(med)} expires on ${formatExpiry(med.expiryDate)}.`;
  return stage === "today"
    ? `${when} Replace it as soon as you can: allergy medication may not work properly after its expiry date.`
    : `${when} Replace it before then: allergy medication may not work properly after its expiry date.`;
}

/** The JSON the service worker turns into a notification (see src/lib/push/notification.ts). */
export type PushPayload = { title: string; body: string; tag: string; url: string };

export function reminderPush(
  med: ReminderMedication & { id: string },
  stage: ReminderStage,
  daysLeft: number,
): PushPayload {
  return {
    title: reminderHeadline(med, stage, daysLeft),
    body: reminderDetail(med, stage),
    // Same medication and expiry date: a newer reminder replaces the older one on the screen.
    tag: `medication-${med.id}-${med.expiryDate}`,
    url: "/profile#medications",
  };
}
