// The Home banner: medications that have expired or expire within 30 days.
// "Today" is the phone's own calendar date, like LocalTime, so the banner is
// never a day off. Medications without an expiry date are ignored.

import type { MedicationRow } from "@/lib/profile/types";

export const SOON_DAYS = 30;

export type MedicationAlert = { medication: MedicationRow; daysLeft: number };
export type MedicationAlerts = { expired: MedicationAlert[]; soon: MedicationAlert[] };

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The phone's calendar date as YYYY-MM-DD. */
export function localDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function daysFrom(today: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

/** Expired (before today, most overdue first) and expiring soon (today to 30 days, soonest first). */
export function medicationAlerts(medications: readonly MedicationRow[], today: string): MedicationAlerts {
  const expired: MedicationAlert[] = [];
  const soon: MedicationAlert[] = [];
  for (const medication of medications) {
    const date = medication.expiry_date;
    if (!date || !DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) continue;
    const daysLeft = daysFrom(today, date);
    if (daysLeft < 0) expired.push({ medication, daysLeft });
    else if (daysLeft <= SOON_DAYS) soon.push({ medication, daysLeft });
  }
  expired.sort((a, b) => a.daysLeft - b.daysLeft);
  soon.sort((a, b) => a.daysLeft - b.daysLeft);
  return { expired, soon };
}

/** "today", "tomorrow", "in 5 days". */
export function whenText(daysLeft: number): string {
  if (daysLeft === 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  return `in ${daysLeft} days`;
}
