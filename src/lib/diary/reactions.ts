// Reaction diary: form checks and row shapes. Pure, no network.
import { isSeverity, type Severity } from "@/lib/allergen/codes";
import { isSymptom, isTreatment, SYMPTOMS, type Symptom, type Treatment } from "./codes";
import { validateOccurredAt } from "./occurred-at";

export const FOOD_MAX = 200;
export const NOTES_MAX = 2000;

export const REACTION_COLUMNS = "id, occurred_at, food, scan_id, symptoms, severity, treatment, notes";

/** A row of public.reactions as the app reads it. */
export type ReactionRow = {
  id: string;
  occurred_at: string;
  food: string;
  scan_id: string | null;
  symptoms: Symptom[];
  severity: Severity;
  treatment: Treatment | null;
  notes: string | null;
};

/** What the form sends. `occurredAt` is a full ISO time, converted on the phone. */
export type ReactionInput = {
  occurredAt: string;
  food: string;
  symptoms: string[];
  severity: string | null;
  treatment: string | null;
  notes: string;
  scanId: string | null;
};

/** The columns the app writes (profile_id is added by the server action). */
export type ReactionWrite = Omit<ReactionRow, "id">;

export type ReactionField = "occurredAt" | "food" | "symptoms" | "severity" | "treatment" | "notes" | "scanId";

export type ReactionErrors = Partial<Record<ReactionField, string>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * Checks a reaction from the form. Returns the cleaned row, or a message per
 * field. The same function runs in the browser and in the server action.
 */
export function validateReaction(
  input: ReactionInput,
  now: Date,
): { ok: true; value: ReactionWrite } | { ok: false; errors: ReactionErrors } {
  const errors: ReactionErrors = {};

  const occurred = input.occurredAt ? new Date(input.occurredAt) : null;
  if (!occurred || Number.isNaN(occurred.getTime())) {
    errors.occurredAt = "Enter the date and time it happened.";
  } else {
    const message = validateOccurredAt(occurred, now);
    if (message) errors.occurredAt = message;
  }

  const food = input.food.trim();
  if (!food) errors.food = "Enter what you ate or touched.";
  else if (food.length > FOOD_MAX) errors.food = `Keep it under ${FOOD_MAX} characters.`;

  // Known values only, in the fixed list order, no repeats.
  const symptoms = SYMPTOMS.filter((s) => input.symptoms.includes(s));
  if (input.symptoms.some((s) => !isSymptom(s))) errors.symptoms = "Choose symptoms from the list.";
  else if (symptoms.length === 0) errors.symptoms = "Choose at least one symptom.";

  if (input.severity === null || !isSeverity(input.severity)) errors.severity = "Choose how bad it was.";

  if (input.treatment !== null && !isTreatment(input.treatment)) errors.treatment = "Choose a treatment from the list.";

  const notes = input.notes.trim();
  if (notes.length > NOTES_MAX) errors.notes = `Keep notes under ${NOTES_MAX} characters.`;

  if (input.scanId !== null && !isUuid(input.scanId)) errors.scanId = "That scan link isn't valid.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      occurred_at: occurred!.toISOString(),
      food,
      scan_id: input.scanId,
      symptoms,
      severity: input.severity as Severity,
      treatment: input.treatment as Treatment | null,
      notes: notes || null,
    },
  };
}

/** The form's starting values for a saved reaction. */
export function toReactionInput(row: ReactionRow): ReactionInput {
  return {
    occurredAt: row.occurred_at,
    food: row.food,
    symptoms: [...row.symptoms],
    severity: row.severity,
    treatment: row.treatment,
    notes: row.notes ?? "",
    scanId: row.scan_id,
  };
}

/** Rows from the database, skipping any with values this app version doesn't know. */
export function readReactionRows(rows: readonly Record<string, unknown>[]): ReactionRow[] {
  return rows.flatMap((r) => {
    const symptoms = Array.isArray(r.symptoms) ? r.symptoms.filter(isSymptom) : [];
    if (
      !isUuid(r.id) ||
      typeof r.occurred_at !== "string" ||
      typeof r.food !== "string" ||
      typeof r.severity !== "string" ||
      !isSeverity(r.severity)
    ) {
      return [];
    }
    return [
      {
        id: r.id,
        occurred_at: r.occurred_at,
        food: r.food,
        scan_id: isUuid(r.scan_id) ? r.scan_id : null,
        symptoms,
        severity: r.severity,
        treatment: isTreatment(r.treatment) ? r.treatment : null,
        notes: typeof r.notes === "string" ? r.notes : null,
      },
    ];
  });
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-29T14:05" in the phone's own time zone, for <input type="datetime-local">. */
export function toLocalInputValue(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * The value of a datetime-local input as a full ISO time, read in the phone's
 * time zone. Empty or unreadable input gives "" (the form then asks for a time).
 */
export function fromLocalInputValue(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return "";
  const date = new Date(value); // no zone in the string: read as local time
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/** "12 AUG 2026", like the diary card design. */
export function formatDiaryDate(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone })
    .format(new Date(iso))
    .toUpperCase();
}

/** "Wed, 12 Aug 2026, 14:05" for the reaction's own page. */
export function formatDiaryDateTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(iso));
}

/** Filled dots for the severity scale (out of 3). */
export const SEVERITY_DOTS: Record<Severity, number> = { mild: 1, moderate: 2, severe: 3 };
