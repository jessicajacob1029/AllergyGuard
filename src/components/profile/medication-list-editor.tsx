"use client";

import { useRef, useState } from "react";
import { PlusIcon } from "@/components/ui/icons";
import { fieldErrorClass, inputClass, labelClass } from "@/components/form-styles";
import type { MedicationDraft } from "@/lib/profile/medications";
import {
  hasErrors,
  isExpired,
  todayIso,
  validateMedication,
  type FieldErrors,
  type MedicationFields,
} from "@/lib/profile/validation";

type Errors = Record<string, FieldErrors<MedicationFields>>;

const isBlank = (d: MedicationDraft) =>
  d.name.trim() === "" && d.dose.trim() === "" && d.expiryDate === "";

/** State for a medication list form. Used by onboarding step 5 and /profile. */
export function useMedicationList(initial: readonly MedicationDraft[]) {
  const [drafts, setDrafts] = useState<MedicationDraft[]>([...initial]);
  const [errors, setErrors] = useState<Errors>({});
  const nextKey = useRef(0);

  return {
    drafts,
    /** Drops blank cards, shows field errors, and returns the list to save (or null if invalid). */
    validate(): MedicationDraft[] | null {
      const kept = drafts.filter((d) => !isBlank(d));
      const found: Errors = {};
      for (const d of kept) {
        const e = validateMedication(d);
        if (hasErrors(e)) found[d.key] = e;
      }
      setDrafts(kept);
      setErrors(found);
      return Object.keys(found).length > 0 ? null : kept;
    },
    reset(next: readonly MedicationDraft[]) {
      setDrafts([...next]);
      setErrors({});
    },
    editor: {
      drafts,
      errors,
      update(key: string, field: keyof MedicationFields, value: string) {
        setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, [field]: value } : d)));
        setErrors((errs) => ({ ...errs, [key]: { ...errs[key], [field]: undefined } }));
      },
      remove(key: string) {
        setDrafts((ds) => ds.filter((d) => d.key !== key));
        setErrors((errs) => {
          const rest = { ...errs };
          delete rest[key];
          return rest;
        });
      },
      add() {
        setDrafts((ds) => [
          ...ds,
          { key: `new-${nextKey.current++}`, name: "", dose: "", expiryDate: "" },
        ]);
      },
    },
  };
}

type EditorProps = ReturnType<typeof useMedicationList>["editor"];

export function MedicationListEditor({ drafts, errors, update, remove, add }: EditorProps) {
  const today = todayIso();

  return (
    <>
      <ul className="space-y-4">
        {drafts.map((draft, index) => {
          const e = errors[draft.key] ?? {};
          const id = (field: string) => `med-${draft.key}-${field}`;
          const label = draft.name.trim() || `Medication ${index + 1}`;
          const expired = isExpired(draft.expiryDate, today);
          return (
            <li
              key={draft.key}
              className="glass space-y-4 rounded-[20px] p-4"
            >
              <div>
                <label htmlFor={id("name")} className={labelClass}>
                  Name
                </label>
                <input
                  id={id("name")}
                  type="text"
                  value={draft.name}
                  onChange={(ev) => update(draft.key, "name", ev.target.value)}
                  placeholder="e.g. EpiPen"
                  aria-invalid={e.name ? true : undefined}
                  aria-describedby={e.name ? id("name-error") : undefined}
                  className={inputClass}
                />
                {e.name && (
                  <p id={id("name-error")} className={fieldErrorClass}>
                    {e.name}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor={id("dose")} className={labelClass}>
                  Dose <span className="font-sans text-xs font-semibold normal-case tracking-normal text-muted">(optional)</span>
                </label>
                <input
                  id={id("dose")}
                  type="text"
                  value={draft.dose}
                  onChange={(ev) => update(draft.key, "dose", ev.target.value)}
                  placeholder="e.g. 0.3 mg"
                  aria-invalid={e.dose ? true : undefined}
                  aria-describedby={e.dose ? id("dose-error") : undefined}
                  className={inputClass}
                />
                {e.dose && (
                  <p id={id("dose-error")} className={fieldErrorClass}>
                    {e.dose}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor={id("expiry")} className={labelClass}>
                  Expiry date{" "}
                  <span className="font-sans text-xs font-semibold normal-case tracking-normal text-muted">(optional)</span>
                </label>
                <input
                  id={id("expiry")}
                  type="date"
                  value={draft.expiryDate}
                  onChange={(ev) => update(draft.key, "expiryDate", ev.target.value)}
                  aria-invalid={e.expiryDate ? true : undefined}
                  aria-describedby={
                    e.expiryDate ? id("expiry-error") : expired ? id("expiry-warning") : undefined
                  }
                  className={inputClass}
                />
                {e.expiryDate ? (
                  <p id={id("expiry-error")} className={fieldErrorClass}>
                    {e.expiryDate}
                  </p>
                ) : (
                  expired && (
                    <p
                      id={id("expiry-warning")}
                      className="mt-1 text-sm font-bold text-caution-ink"
                    >
                      This has expired. Please replace it as soon as you can.
                    </p>
                  )
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(draft.key)}
                aria-label={`Remove ${label}`}
                className="flex h-11 items-center text-sm font-bold text-unsafe-ink"
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={add}
        className="flex min-h-11 items-center gap-2 text-[15px] font-bold text-primary-ink"
      >
        <PlusIcon className="size-[18px]" />
        Add a medication
      </button>
    </>
  );
}
