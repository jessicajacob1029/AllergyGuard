"use client";

import { useState } from "react";
import { ContactFields } from "@/components/profile/contact-fields";
import {
  hasErrors,
  validateContact,
  type ContactDraft,
  type FieldErrors,
} from "@/lib/profile/validation";
import { StepShell } from "./step-shell";

type Props = {
  initial: ContactDraft;
  onSave: (draft: ContactDraft) => Promise<string | null>;
  onSkip: () => Promise<string | null>;
  onBack: () => void;
};

export function ContactStep({ initial, onSave, onSkip, onBack }: Props) {
  const [draft, setDraft] = useState<ContactDraft>(initial);
  const [errors, setErrors] = useState<FieldErrors<ContactDraft>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<string | null>) {
    setSaveError(null);
    setBusy(true);
    const result = await action();
    if (result) {
      setSaveError(result);
      setBusy(false);
    }
  }

  return (
    <StepShell
      step={4}
      title="Emergency contact"
      description="Who should be called in an emergency? They'll get a one-tap call button on your emergency card."
      primaryLabel="Save and continue"
      busy={busy}
      error={saveError}
      onSubmit={() => {
        const found = validateContact(draft);
        setErrors(found);
        if (!hasErrors(found)) run(() => onSave(draft));
      }}
      secondary={{
        label: "Add later",
        onClick: () => {
          setErrors({});
          run(onSkip);
        },
      }}
      onBack={onBack}
    >
      <ContactFields
        idPrefix="contact"
        draft={draft}
        errors={errors}
        onChange={(field, value) => {
          setDraft((d) => ({ ...d, [field]: value }));
          setErrors((errs) => ({ ...errs, [field]: undefined }));
        }}
      />
    </StepShell>
  );
}
