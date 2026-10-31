// Calendar dates in India Standard Time. Reminders are worked out on IST
// dates, not UTC: at 02:00 IST it is still the previous day in UTC, so a UTC
// date would send "expires tomorrow" on the expiry day itself.
//
// Pure functions, no Deno or Node APIs: shared by the Edge Function and Vitest.

/** IST is UTC+05:30 all year (India has no daylight saving time). */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The IST calendar date (YYYY-MM-DD) at the instant `now`. */
export function istDate(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Whole days from `from` to `to` (both YYYY-MM-DD): 2026-11-01 → 2026-11-08 is 7; earlier `to` is negative. */
export function daysBetween(from: string, to: string): number {
  if (!isIsoDate(from) || !isIsoDate(to)) throw new Error(`Not a YYYY-MM-DD date: ${from} / ${to}`);
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  if (!isIsoDate(date)) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}
