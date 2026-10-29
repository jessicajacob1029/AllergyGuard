// When a reaction happened: the one rule for which times are allowed.
// Used by the form (instant feedback) and by the server action (the real check).

/** Phone clocks drift, so a time this far ahead of "now" is still accepted. */
export const FUTURE_GRACE_MS = 10 * 60 * 1000;

/** Earliest accepted time. The database rejects anything earlier too. */
export const EARLIEST_OCCURRED_AT = new Date("1900-01-01T00:00:00Z");

/**
 * Returns an error message for the user, or null when `occurredAt` is allowed.
 *
 * Rules:
 * - more than FUTURE_GRACE_MS after `now`: "That time is in the future."
 * - before EARLIEST_OCCURRED_AT: rejected (you choose the message)
 * - anything else, however old: allowed
 *
 * `occurredAt` is always a valid Date here (an empty or unreadable input is
 * caught before this runs). `now` is passed in so tests don't depend on the clock.
 */
export function validateOccurredAt(occurredAt: Date, now: Date): string | null {
  // More than 10 minutes ahead of "now": a typo or a wrong date, not clock drift.
  if (occurredAt.getTime() > now.getTime() + FUTURE_GRACE_MS) {
    return "That time is in the future.";
  }
  // Before 1900: almost certainly a mistyped year.
  if (occurredAt.getTime() < EARLIEST_OCCURRED_AT.getTime()) {
    return "Please enter a date after 1900.";
  }
  return null;
}
