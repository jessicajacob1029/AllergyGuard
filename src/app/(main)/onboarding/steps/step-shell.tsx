"use client";

import { useEffect, useRef, type ComponentType, type FormEvent, type ReactNode } from "react";
import {
  autoWidth,
  formAlertClass,
  primaryButtonClass,
  secondaryButtonClass,
  successButtonClass,
  tertiaryButtonClass,
} from "@/components/form-styles";
import { HeaderBand } from "@/components/ui/header-band";
import { AlertIcon, MedicineIcon, PersonIcon, PhoneIcon, ShieldIcon } from "@/components/ui/icons";
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
  /** Optional extra action under the main ones, e.g. "Add later". */
  secondary?: { label: string; onClick: () => void };
  /** Last data step: the primary button is the green "done" style. */
  finish?: boolean;
};

/** Icon tile for each step (decorative). */
const STEP_ICONS: Record<number, ComponentType<{ className?: string }>> = {
  1: ShieldIcon,
  2: PersonIcon,
  3: AlertIcon,
  4: PhoneIcon,
  5: MedicineIcon,
};

/** Progress: "STEP n OF 6" and a peach → violet bar. */
export function StepProgress({ step }: { step: number }) {
  const percent = Math.round((step / TOTAL_STEPS) * 100);
  return (
    <div className="mb-7">
      <div className="eyebrow flex justify-between" aria-hidden="true">
        <span>
          Step {step} of {TOTAL_STEPS}
        </span>
        <span>{percent}%</span>
      </div>
      <div
        className="mt-2 h-[6px] w-full overflow-hidden rounded-full bg-ink/10"
        role="progressbar"
        aria-label={`Setup progress: step ${step} of ${TOTAL_STEPS}`}
        aria-valuemin={1}
        aria-valuemax={TOTAL_STEPS}
        aria-valuenow={step}
      >
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,#ffc0a4,#8c79e6)]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** Decorative tile above the step heading. */
export function StepTile({ children, done = false }: { children: ReactNode; done?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mb-6 flex size-[76px] items-center justify-center shadow-[0_15px_30px_rgb(93_69_137/0.12)] ${
        done
          ? "rounded-full bg-[linear-gradient(145deg,#d9f5e8,#9fddbf)] text-safe-ink"
          : "rounded-[24px] bg-[linear-gradient(145deg,#ffe4b0,#edc8ff)] text-primary-ink"
      }`}
    >
      {children}
    </span>
  );
}

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
  const Icon = STEP_ICONS[step] ?? ShieldIcon;

  // Move focus to the new step's heading so screen readers announce it.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy) onSubmit();
  }

  const primary = (
    <button type="submit" disabled={busy} className={finish ? successButtonClass : primaryButtonClass}>
      {busy ? "Saving…" : primaryLabel}
    </button>
  );

  return (
    <form onSubmit={handleSubmit} noValidate>
      <HeaderBand
        eyebrow="Set up your profile"
        title={title}
        headingRef={headingRef}
        top={
          <>
            <StepProgress step={step} />
            <StepTile>
              <Icon className="size-9" />
            </StepTile>
          </>
        }
      />

      <div className="mx-auto w-full max-w-sm space-y-6 px-4 pb-8">
        {description && <p className="text-[15px] leading-relaxed text-muted">{description}</p>}

        {children}

        {error && (
          <p role="alert" className={formAlertClass}>
            {error}
          </p>
        )}

        <div className="space-y-3 pt-2">
          {onBack ? (
            <div className="grid grid-cols-[auto_1fr] gap-2.5">
              <button type="button" disabled={busy} onClick={onBack} className={`${autoWidth(tertiaryButtonClass)} px-5`}>
                Back
              </button>
              {primary}
            </div>
          ) : (
            primary
          )}
          {secondary && (
            <button type="button" disabled={busy} onClick={secondary.onClick} className={secondaryButtonClass}>
              {secondary.label}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
