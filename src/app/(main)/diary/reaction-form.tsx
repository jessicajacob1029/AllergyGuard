"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, useTransition, type FormEvent, type ReactNode } from "react";
import {
  fieldErrorClass,
  formAlertClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  tertiaryButtonClass,
} from "@/components/form-styles";
import { useHydrated } from "@/components/ui/local-time";
import { SEVERITIES, SEVERITY_LABELS } from "@/lib/allergen/codes";
import { SYMPTOM_LABELS, SYMPTOMS, TREATMENT_LABELS, TREATMENTS } from "@/lib/diary/codes";
import {
  FOOD_MAX,
  fromLocalInputValue,
  NOTES_MAX,
  SEVERITY_DOTS,
  toLocalInputValue,
  validateReaction,
  type ReactionErrors,
  type ReactionField,
  type ReactionInput,
} from "@/lib/diary/reactions";
import { saveReaction } from "./actions";

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

type Props = {
  /** Null for a new reaction. */
  reactionId: string | null;
  /** Saved values when editing; for a new reaction, food and scan link may be filled in from a scan. */
  initial: Partial<ReactionInput>;
  /** Shown when the reaction is linked to a scan, e.g. "Amul butter". */
  scanLabel?: string | null;
  cancelHref: string;
};

const FIELD_ORDER: ReactionField[] = ["occurredAt", "food", "symptoms", "severity", "treatment", "notes", "scanId"];

const chipClass = (on: boolean) =>
  "flex min-h-11 items-center gap-1.5 rounded-[12px] border px-3.5 text-[15px] font-semibold " +
  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary focus-visible:outline-2 focus-visible:outline-primary " +
  (on ? "border-primary-ink/40 bg-band text-primary-ink" : "border-ink/15 bg-white/70 text-ink");

export function ReactionForm({ reactionId, initial, scanLabel = null, cancelHref }: Props) {
  const hydrated = useHydrated();
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  // "Now" for a new reaction. Shown only after hydration: the server's clock is UTC.
  const [startedAt] = useState(() => new Date());
  const [when, setWhen] = useState<string | null>(null);
  const [food, setFood] = useState(initial.food ?? "");
  const [symptoms, setSymptoms] = useState<string[]>(initial.symptoms ?? []);
  const [severity, setSeverity] = useState<string | null>(initial.severity ?? null);
  const [treatment, setTreatment] = useState<string | null>(initial.treatment ?? null);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [scanId, setScanId] = useState<string | null>(initial.scanId ?? null);
  const [errors, setErrors] = useState<ReactionErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const whenValue =
    when ?? (hydrated ? toLocalInputValue(initial.occurredAt ? new Date(initial.occurredAt) : startedAt) : "");

  function toggleSymptom(code: string) {
    setSymptoms((list) => (list.includes(code) ? list.filter((s) => s !== code) : [...list, code]));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const input: ReactionInput = {
      occurredAt: fromLocalInputValue(whenValue),
      food,
      symptoms,
      severity,
      treatment,
      notes,
      scanId,
    };
    const checked = validateReaction(input, new Date());
    if (!checked.ok) {
      setErrors(checked.errors);
      const first = FIELD_ORDER.find((f) => checked.errors[f]);
      if (first) document.getElementById(`reaction-${first}`)?.focus();
      return;
    }
    setErrors({});
    startTransition(async () => {
      // On success the Server Function redirects to the saved reaction.
      const result = await saveReaction(input, reactionId);
      if (result?.errors) setErrors(result.errors);
      if (result?.error) setFormError(result.error);
    });
  }

  const describedBy = (field: ReactionField) => (errors[field] ? `reaction-${field}-error` : undefined);

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {!online && (
        <p role="status" className="rounded-[18px] border border-caution-ink/20 bg-caution-band p-3.5 text-sm font-bold text-caution-ink">
          You&apos;re offline. Saving a reaction needs an internet connection. Your emergency card still works.
        </p>
      )}

      <div className="glass space-y-6 rounded-card p-5">

        <div>
          <label htmlFor="reaction-occurredAt" className={labelClass}>
            When did it happen?
          </label>
          <input
            id="reaction-occurredAt"
            type="datetime-local"
            value={whenValue}
            onChange={(e) => setWhen(e.target.value)}
            aria-invalid={Boolean(errors.occurredAt)}
            aria-describedby={describedBy("occurredAt")}
            className={inputClass}
          />
          <FieldError field="occurredAt" errors={errors} />
        </div>

        <div>
          <label htmlFor="reaction-food" className={labelClass}>
            Food or product
          </label>
          <input
            id="reaction-food"
            type="text"
            value={food}
            onChange={(e) => setFood(e.target.value)}
            maxLength={FOOD_MAX}
            placeholder="e.g. Chocolate bar, restaurant meal"
            autoComplete="off"
            aria-invalid={Boolean(errors.food)}
            aria-describedby={describedBy("food")}
            className={inputClass}
          />
          <FieldError field="food" errors={errors} />
          {scanId && (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-band px-3 py-1.5">
              <p className="text-sm font-semibold text-ink">
                Linked to your scan{scanLabel ? ` of ${scanLabel}` : ""}.
              </p>
              <button
                type="button"
                onClick={() => setScanId(null)}
                className="min-h-11 px-2 text-sm font-bold text-primary-ink"
              >
                Remove link
              </button>
            </div>
          )}
        </div>

        <Group legend="Symptoms" hint="Tap every symptom you had." field="symptoms" errors={errors}>
          <div className="flex flex-wrap gap-2">
            {SYMPTOMS.map((code, i) => {
              const on = symptoms.includes(code);
              return (
                <button
                  key={code}
                  id={i === 0 ? "reaction-symptoms" : undefined}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleSymptom(code)}
                  className={chipClass(on)}
                >
                  {on && <span aria-hidden="true">✓</span>}
                  {SYMPTOM_LABELS[code]}
                </button>
              );
            })}
          </div>
        </Group>

        <Group legend="How bad was it?" field="severity" errors={errors}>
          <div className="grid grid-cols-3 gap-1 rounded-[14px] bg-ink/[0.06] p-1">
            {SEVERITIES.map((level, i) => (
              <label
                key={level}
                className={`flex min-h-[52px] cursor-pointer flex-col items-center justify-center gap-1 rounded-[11px] text-[15px] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary ${
                  severity === level ? "bg-white font-bold text-ink shadow-[0_4px_12px_rgb(44_35_49/0.1)]" : "font-semibold text-muted"
                }`}
              >
                <input
                  id={i === 0 ? "reaction-severity" : undefined}
                  type="radio"
                  name="severity"
                  value={level}
                  checked={severity === level}
                  onChange={() => setSeverity(level)}
                  className="sr-only"
                />
                <span aria-hidden="true" className="flex gap-1">
                  {[1, 2, 3].map((n) => (
                    <span
                      key={n}
                      className={`size-2 rounded-full ${n <= SEVERITY_DOTS[level] ? "bg-current" : "bg-ink/15"}`}
                    />
                  ))}
                </span>
                {SEVERITY_LABELS[level]}
              </label>
            ))}
          </div>
        </Group>

        <Group legend="Treatment (optional)" hint="What did you take or do?" field="treatment" errors={errors}>
          <div className="flex flex-wrap gap-2">
            {TREATMENTS.map((t, i) => (
              <label key={t} className={`${chipClass(treatment === t)} cursor-pointer`}>
                <input
                  id={i === 0 ? "reaction-treatment" : undefined}
                  type="radio"
                  name="treatment"
                  value={t}
                  checked={treatment === t}
                  onChange={() => setTreatment(t)}
                  className="sr-only"
                />
                {TREATMENT_LABELS[t]}
              </label>
            ))}
          </div>
          {treatment !== null && (
            <button
              type="button"
              onClick={() => setTreatment(null)}
              className="mt-1 min-h-11 text-sm font-bold text-primary-ink"
            >
              Clear treatment
            </button>
          )}
        </Group>

        <div>
          <label htmlFor="reaction-notes" className={labelClass}>
            Notes (optional)
          </label>
          <textarea
            id="reaction-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={NOTES_MAX}
            rows={4}
            placeholder="e.g. Started 10 minutes after eating"
            aria-invalid={Boolean(errors.notes)}
            aria-describedby={describedBy("notes")}
            className={`${inputClass} h-auto py-3`}
          />
          <FieldError field="notes" errors={errors} />
        </div>
      </div>

      <FieldError field="scanId" errors={errors} />
      {formError && (
        <p role="alert" className={formAlertClass}>
          {formError}
        </p>
      )}

      <div className="space-y-3 pt-1">
        <button type="submit" disabled={pending || !online} className={primaryButtonClass}>
          {pending ? "Saving…" : reactionId ? "Save changes" : "Save reaction"}
        </button>
        <Link href={cancelHref} className={tertiaryButtonClass}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

function FieldError({ field, errors }: { field: ReactionField; errors: ReactionErrors }) {
  if (!errors[field]) return null;
  return (
    <p id={`reaction-${field}-error`} role="alert" className={fieldErrorClass}>
      {errors[field]}
    </p>
  );
}

function Group({
  legend,
  hint,
  field,
  errors,
  children,
}: {
  legend: string;
  hint?: string;
  field: ReactionField;
  errors: ReactionErrors;
  children: ReactNode;
}) {
  return (
    <fieldset aria-describedby={errors[field] ? `reaction-${field}-error` : undefined} className="space-y-2">
      <legend className={labelClass}>{legend}</legend>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      {children}
      <FieldError field={field} errors={errors} />
    </fieldset>
  );
}
