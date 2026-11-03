// Date and time formatting. Pure: pass `timeZone` in tests; leave it out in the
// browser to use the phone's own zone. Never call these on the server for
// display: Vercel's servers run in UTC.

/** "29 Oct 2026, 23:37" for when a product was checked. */
export function formatCheckedAt(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso));
}

const part = (iso: string, timeZone: string | undefined, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { ...options, timeZone }).format(new Date(iso));

/** "29 Oct · 08:50" for a row in a list of scans. */
export function formatListTime(iso: string, timeZone?: string): string {
  return `${part(iso, timeZone, { day: "numeric", month: "short" })} · ${part(iso, timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
}

/** "Thursday · 29 Oct" for the date line on home. */
export function formatWeekdayDate(iso: string, timeZone?: string): string {
  return `${part(iso, timeZone, { weekday: "long" })} · ${part(iso, timeZone, { day: "numeric", month: "short" })}`;
}

/** "07" (day of the month, two digits) for the diary date tile. */
export function formatDayOfMonth(iso: string, timeZone?: string): string {
  return part(iso, timeZone, { day: "2-digit" });
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** "OCT" for the diary date tile (always three letters: en-GB would say "Sept"). */
export function formatShortMonth(iso: string, timeZone?: string): string {
  return MONTHS[Number(part(iso, timeZone, { month: "numeric" })) - 1];
}
