// Date and time formatting. Pure: pass `timeZone` in tests; leave it out in the
// browser to use the phone's own zone. Never call these on the server for
// display: Vercel's servers run in UTC.

/** "29 Oct 2026, 23:37" for when a product was checked. */
export function formatCheckedAt(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso));
}
