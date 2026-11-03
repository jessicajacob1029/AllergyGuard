"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { successButtonClass } from "@/components/form-styles";
import { HeaderBand } from "@/components/ui/header-band";
import { CheckIcon } from "@/components/ui/icons";
import { StepTile } from "./steps/step-shell";
import type { SavedAllergen } from "@/lib/profile/allergen-selection";
import { fromMedicationRow } from "@/lib/profile/medications";
import type { WizardStep } from "@/lib/profile/onboarding";
import {
  finishOnboarding,
  saveAllergens,
  saveMedications,
  savePrimaryContact,
  saveProfileName,
  skipContact,
} from "@/lib/profile/save";
import type { ContactRow, MedicationRow, ProfileBundle, ProfileRow } from "@/lib/profile/types";
import { DEFAULT_PHONE_PREFIX } from "@/lib/profile/validation";
import { createClient } from "@/lib/supabase/client";
import { AllergensStep } from "./steps/allergens-step";
import { ContactStep } from "./steps/contact-step";
import { DisclaimerStep } from "./steps/disclaimer-step";
import { MedicationsStep } from "./steps/medications-step";
import { NameStep } from "./steps/name-step";
import { frameClass } from "@/components/ui/frame";

type Props = {
  initialStep: WizardStep;
  bundle: ProfileBundle | null;
  /** Name to start step 2 with when there is no profile yet (e.g. from Google). */
  suggestedName?: string;
};

export function OnboardingWizard({ initialStep, bundle, suggestedName = "" }: Props) {
  const [supabase] = useState(createClient);
  const [step, setStep] = useState<WizardStep>(initialStep);
  const [profile, setProfile] = useState<ProfileRow | null>(bundle?.profile ?? null);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(
    Boolean(bundle?.profile.disclaimer_accepted_at),
  );
  const [allergens, setAllergens] = useState<SavedAllergen[]>(bundle?.allergens ?? []);
  const [contact, setContact] = useState<ContactRow | null>(bundle?.primaryContact ?? null);
  const [medications, setMedications] = useState<MedicationRow[]>(bundle?.medications ?? []);

  return (
    <div key={step}>
      {step === 1 && (
        <DisclaimerStep
          accepted={disclaimerAccepted}
          onAcceptedChange={setDisclaimerAccepted}
          onContinue={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <NameStep
          initialName={profile?.name ?? suggestedName}
          onBack={() => setStep(1)}
          onSave={async (name) => {
            const result = await saveProfileName(supabase, profile, name);
            if (!result.ok) return result.error;
            setProfile(result.data);
            setStep(3);
            return null;
          }}
        />
      )}

      {step === 3 && profile && (
        <AllergensStep
          initial={allergens}
          onBack={() => setStep(2)}
          onSave={async (selections) => {
            const result = await saveAllergens(supabase, profile, allergens, selections);
            if (!result.ok) return result.error;
            setProfile(result.data.profile);
            setAllergens(result.data.allergens);
            setStep(4);
            return null;
          }}
        />
      )}

      {step === 4 && profile && (
        <ContactStep
          initial={{
            name: contact?.name ?? "",
            phone: contact?.phone ?? DEFAULT_PHONE_PREFIX,
            relationship: contact?.relationship ?? "",
          }}
          onBack={() => setStep(3)}
          onSave={async (draft) => {
            const result = await savePrimaryContact(supabase, profile, contact, draft);
            if (!result.ok) return result.error;
            setProfile(result.data.profile);
            setContact(result.data.contact);
            setStep(5);
            return null;
          }}
          onSkip={async () => {
            const result = await skipContact(supabase, profile);
            if (!result.ok) return result.error;
            setProfile(result.data);
            setStep(5);
            return null;
          }}
        />
      )}

      {step === 5 && profile && (
        <MedicationsStep
          initial={medications.map(fromMedicationRow)}
          onBack={() => setStep(4)}
          onSave={async (drafts) => {
            const saved = await saveMedications(supabase, profile, medications, drafts);
            if (!saved.ok) return saved.error;
            setMedications(saved.data);
            const finished = await finishOnboarding(supabase, profile);
            if (!finished.ok) return finished.error;
            setProfile(finished.data);
            setStep(6);
            return null;
          }}
        />
      )}

      {step === 6 && <DoneStep hasContact={contact !== null} />}
    </div>
  );
}

function DoneStep({ hasContact }: { hasContact: boolean }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div>
      <HeaderBand
        eyebrow="Set up your profile"
        title="You're all set"
        headingRef={headingRef}
        top={
          <StepTile done>
            <CheckIcon className="size-10" />
          </StepTile>
        }
      />
      <div className={`${frameClass()} space-y-6 pb-8 desk:pb-12`}>
        <p className="text-[15px] leading-relaxed text-muted">
          Your allergy profile is saved.
          {!hasContact && " You can add an emergency contact any time from your profile."}
        </p>
        <Link href="/" className={successButtonClass}>
          Go to home
        </Link>
      </div>
    </div>
  );
}
