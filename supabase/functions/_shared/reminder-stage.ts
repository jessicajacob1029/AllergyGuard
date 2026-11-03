// Which expiry reminder (if any) is due for one medication today.
// Pure function, no Deno or Node APIs: shared by the Edge Function and Vitest.

/** The four reminders, from earliest to most urgent. */
export const REMINDER_STAGES = ["30d", "7d", "1d", "today"] as const;
export type ReminderStage = (typeof REMINDER_STAGES)[number];

/**
 * The reminder to send today, or null for none.
 *
 * `daysLeft` is expiry date − today, both as IST calendar dates
 * (0 = expires today, 1 = tomorrow, −1 = expired yesterday).
 * `alreadySent` lists the stages already sent for this medication AND this
 * expiry date (a new expiry date starts with an empty list).
 *
 * Rules (agreed in docs/PHASE-7-PLAN.md, section 1):
 * - Windows, not exact days, so a missed run or a medication added late still
 *   gets one reminder:
 *     8 to 30 days left → "30d"
 *     2 to 7 days left  → "7d"
 *     1 day left        → "1d"
 *     0 days left       → "today"
 *   Anything else (more than 30, or already expired) → null.
 * - Never send a stage that is in `alreadySent`.
 * - Only the most urgent stage due is sent: if the window's stage or a more
 *   urgent one was already sent, send nothing (no going back to an earlier one).
 *   Example: 5 days left, nothing sent yet → "7d" (the 30-day one is skipped).
 */
export function reminderStage(daysLeft: number, alreadySent: readonly ReminderStage[]): ReminderStage | null {
  // Which window are we in today?
  const stage: ReminderStage | null =
    daysLeft === 0 ? "today"
    : daysLeft === 1 ? "1d"
    : daysLeft >= 2 && daysLeft <= 7 ? "7d"
    : daysLeft >= 8 && daysLeft <= 30 ? "30d"
    : null; // more than 30 days left, or already expired
  if (stage === null) return null;

  // Send it only if it's more urgent than anything already sent
  // (this also blocks repeats and going back to an earlier reminder).
  const mostUrgentSent = Math.max(-1, ...alreadySent.map((s) => REMINDER_STAGES.indexOf(s)));
  return REMINDER_STAGES.indexOf(stage) > mostUrgentSent ? stage : null;
}
