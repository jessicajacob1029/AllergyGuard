"use client";

import { useState } from "react";
import {
  MedicationListEditor,
  useMedicationList,
} from "@/components/profile/medication-list-editor";
import type { MedicationDraft } from "@/lib/profile/medications";
import { StepShell } from "./step-shell";

type Props = {
  initial: readonly MedicationDraft[];
  onSave: (drafts: MedicationDraft[]) => Promise<string | null>;
  onBack: () => void;
};

export function MedicationsStep({ initial, onSave, onBack }: Props) {
  const list = useMedicationList(initial);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setSaveError(null);
    const kept = list.validate();
    if (!kept) return;
    setBusy(true);
    const result = await onSave(kept);
    if (result) {
      setSaveError(result);
      setBusy(false);
    }
  }

  return (
    <StepShell
      finish
      step={5}
      title="Medications"
      description="Add any allergy medication you carry, like an adrenaline auto-injector or antihistamine. You can skip this."
      primaryLabel="Finish setup"
      busy={busy}
      error={saveError}
      onSubmit={handleSubmit}
      onBack={onBack}
    >
      <MedicationListEditor {...list.editor} />
    </StepShell>
  );
}
