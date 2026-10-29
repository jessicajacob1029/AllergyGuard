import { useId, type ReactNode } from "react";
import { TONE_ACCENT, type Tone } from "./tones";

/** Small uppercase Space Mono label (style v2 "eyebrow"). */
export function SectionLabel({
  id,
  as: Tag = "h2",
  children,
}: {
  /** Kept for callers; v2 eyebrows are one neutral colour. */
  tone?: Tone;
  id?: string;
  as?: "h2" | "h3" | "p";
  children: ReactNode;
}) {
  return (
    <Tag id={id} className="eyebrow">
      {children}
    </Tag>
  );
}

type Props = {
  tone: Tone;
  /** Eyebrow label, rendered as a heading. Omit for an unlabeled card. */
  label?: ReactNode;
  labelId?: string;
  labelAs?: "h2" | "h3";
  /** Card title under the eyebrow (style v2 h3). */
  title?: ReactNode;
  /** Shown at the top right, e.g. a "Manage ›" link. */
  action?: ReactNode;
  /** Kept for callers: the label is always inside the card in v2. */
  labelInside?: boolean;
  /** 4px coloured left border. */
  accent?: boolean;
  className?: string;
  children: ReactNode;
};

/** Frosted glass card with an optional eyebrow, title and action. */
export function SectionCard({
  tone,
  label,
  labelId,
  labelAs = "h2",
  title,
  action,
  accent = false,
  className = "",
  children,
}: Props) {
  const autoId = useId();
  const headingId = labelId ?? autoId;
  const named = Boolean(label || title);
  const head =
    label || title || action ? (
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {label && (
            <SectionLabel id={label ? headingId : undefined} as={title ? "p" : labelAs}>
              {label}
            </SectionLabel>
          )}
          {title && (
            <h2 id={label ? undefined : headingId} className="mt-1 text-xl font-semibold leading-tight tracking-[-0.03em] text-ink">
              {title}
            </h2>
          )}
        </div>
        {action}
      </div>
    ) : null;
  const Root = named ? "section" : "div";
  return (
    <Root
      aria-labelledby={named ? headingId : undefined}
      className={`glass rounded-card p-5 ${accent ? `border-l-4 ${TONE_ACCENT[tone]}` : ""} ${className}`}
    >
      {head}
      {children}
    </Root>
  );
}
