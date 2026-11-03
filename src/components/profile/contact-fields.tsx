"use client";

import { fieldErrorClass, inputClass, labelClass } from "@/components/form-styles";
import type { ReactNode } from "react";
import { InputWithIcon } from "@/components/ui/field";
import { PersonIcon, PhoneIcon } from "@/components/ui/icons";
import type { ContactDraft, FieldErrors } from "@/lib/profile/validation";

type Props = {
  /** Prefix for input ids, so several forms can be on one page. */
  idPrefix: string;
  draft: ContactDraft;
  errors: FieldErrors<ContactDraft>;
  onChange: (field: keyof ContactDraft, value: string) => void;
};

const FIELDS: {
  key: keyof ContactDraft;
  label: string;
  type: string;
  inputMode?: "tel";
  optional?: boolean;
  hint?: string;
}[] = [
  { key: "name", label: "Name", type: "text" },
  {
    key: "phone",
    label: "Phone number",
    type: "tel",
    inputMode: "tel",
    hint: "Include the country code, e.g. +91 for India, +44 for the UK.",
  },
  { key: "relationship", label: "Relationship", type: "text", optional: true },
];

const FIELD_ICON: Record<string, ReactNode> = {
  name: <PersonIcon className="size-5" />,
  phone: <PhoneIcon className="size-5" />,
};

/** Name / phone / relationship inputs. The parent owns state and validation. */
export function ContactFields({ idPrefix, draft, errors, onChange }: Props) {
  return (
    <div className="space-y-5">
      {FIELDS.map((field) => {
        const id = `${idPrefix}-${field.key}`;
        const error = errors[field.key];
        const describedBy =
          [field.hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") ||
          undefined;
        return (
          <div key={field.key}>
            <label htmlFor={id} className={labelClass}>
              {field.label}
              {field.optional && (
                <span className="font-sans text-xs font-semibold normal-case tracking-normal text-muted"> (optional)</span>
              )}
            </label>
            <InputWithIcon icon={FIELD_ICON[field.key]}>
              <input
                id={id}
                type={field.type}
                inputMode={field.inputMode}
                autoComplete="off"
                placeholder={field.key === "phone" ? "+91 98765 43210" : undefined}
                value={draft[field.key]}
                onChange={(e) => onChange(field.key, e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy}
                className={`${inputClass} pr-12`}
              />
            </InputWithIcon>
            {field.hint && (
              <p id={`${id}-hint`} className="mt-1 text-sm font-semibold text-muted">
                {field.hint}
              </p>
            )}
            {error && (
              <p id={`${id}-error`} className={fieldErrorClass}>
                {error}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
