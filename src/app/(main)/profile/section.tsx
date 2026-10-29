import type { ComponentType, ReactNode } from "react";
import { formAlertClass } from "@/components/form-styles";
import { AlertIcon, MedicineIcon, PersonIcon, PhoneIcon } from "@/components/ui/icons";
import type { Tone } from "@/components/ui/tones";

type Props = {
  id: string;
  title: string;
  /** Kept for callers; v2 sections share one look. */
  tone?: Tone;
  description?: string;
  /** Success message, announced politely. */
  status?: string | null;
  /** Save error, announced as an alert. */
  error?: string | null;
  children: ReactNode;
};

/** Icon tile for each section (decorative). */
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  name: PersonIcon,
  allergies: AlertIcon,
  contacts: PhoneIcon,
  medications: MedicineIcon,
};

/** A glass card on the /profile page. Each section saves independently. */
export function Section({ id, title, description, status, error, children }: Props) {
  const Icon = ICONS[id] ?? PersonIcon;
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="glass scroll-mt-24 space-y-5 rounded-card p-5">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-band text-primary-ink">
          <Icon className="size-5" />
        </span>
        <h2 id={`${id}-heading`} className="text-xl font-semibold tracking-[-0.03em] text-ink">
          {title}
        </h2>
      </div>
      {description && <p className="-mt-2 text-sm text-muted">{description}</p>}
      {children}
      <p role="status" className="text-sm font-bold text-safe-ink empty:hidden">
        {status ?? ""}
      </p>
      {error && (
        <p role="alert" className={formAlertClass}>
          {error}
        </p>
      )}
    </section>
  );
}
