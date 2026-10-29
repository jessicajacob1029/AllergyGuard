"use client";

import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import {
  formAlertClass,
  primaryButtonClass,
  secondaryButtonClass,
  successButtonClass,
  tertiaryButtonClass,
} from "@/components/form-styles";
import { HeaderBand } from "@/components/ui/header-band";
import { TOTAL_STEPS } from "@/lib/profile/onboarding";

type Props = {
  step: number;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  primaryLabel: string;
  busy?: boolean;
  error?: string | null;
  onSubmit: () => void;
  onBack?: () => void;
  /** Optional extra action between primary and Back, e.g. "Add later". */
  secondary?: { label: string; onClick: () => void };
  /** Last data step: the primary button is the green "done" style. */
  finish?: boolean;
};

/** Layout shared by every onboarding step: progress, heading, body, actions. */
export function StepShell({
  step,
  title,
  description,
  children,
  primaryLabel,
  busy = false,
  error,
  onSubmit,
  onBack,
  secondary,
  finish = false,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the new step's heading so screen readers announce it.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy) onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <HeaderBand title={title} headingRef={headingRef}>
        <p className="mt-4 text-sm font-extrabold text-muted">
          Step {step} of {TOTAL_STEPS}
        </p>
        <div
          className="mt-2 h-2 w-full rounded-full bg-card"
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-valuenow={step}
        >
          <div className="h-2 rounded-full bg-primary" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
        </div>
      </HeaderBand>

      <div className="mx-auto w-full max-w-sm space-y-6 px-4 py-6">
        {description && <p className="text-base font-semibold text-muted">{description}</p>}

        {children}

        {error && (
          <p role="alert" className={formAlertClass}>
            {error}
          </p>
        )}

        <div className="space-y-3">
          <button type="submit" disabled={busy} className={finish ? successButtonClass : primaryButtonClass}>
            {busy ? "Saving…" : primaryLabel}
          </button>
          {secondary && (
            <button type="button" disabled={busy} onClick={secondary.onClick} className={secondaryButtonClass}>
              {secondary.label}
            </button>
          )}
          {onBack && (
            <button type="button" disabled={busy} onClick={onBack} className={tertiaryButtonClass}>
              Back
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
