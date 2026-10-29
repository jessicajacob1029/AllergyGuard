"use client";

import { useState } from "react";
import { AllergenPicker } from "@/components/allergen-picker";
import { fieldErrorClass } from "@/components/form-styles";
import type { AllergenSelection } from "@/lib/profile/allergen-selection";
import { validateAllergenList } from "@/lib/profile/validation";
import { StepShell } from "./step-shell";

type Props = {
  initial: readonly AllergenSelection[];
  onSave: (selections: AllergenSelection[]) => Promise<string | null>;
  onBack: () => void;
};

export function AllergensStep({ initial, onSave, onBack }: Props) {
  const [value, setValue] = useState<AllergenSelection[]>([...initial]);
  const [listError, setListError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    const error = validateAllergenList(value);
    setListError(error);
    setSaveError(null);
    if (error) return;
    setBusy(true);
    const result = await onSave(value);
    if (result) {
      setSaveError(result);
      setBusy(false);
    }
  }

  return (
    <StepShell
      step={3}
      title="Your allergies"
      description="We'll check every product against these."
      primaryLabel="Continue"
      busy={busy}
      error={saveError}
      onSubmit={handleSubmit}
      onBack={onBack}
    >
      <AllergenPicker
        value={value}
        onChange={(next) => {
          setValue(next);
          if (next.length > 0) setListError(null);
        }}
      />
      {listError && (
        <p role="alert" className={fieldErrorClass}>
          {listError}
        </p>
      )}
    </StepShell>
  );
}
