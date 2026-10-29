import type { ReactNode } from "react";
import { TONE_BAND, TONE_INK, type Tone } from "./tones";

type Props = {
  tone?: Tone;
  /** Emoji or icon before the text; emoji are decorative. */
  icon?: ReactNode;
  size?: "sm" | "md";
  className?: string;
  children: ReactNode;
};

/** Soft-coloured label chip (style v2). Always carries text, so meaning never rests on colour. */
export function Pill({ tone = "primary", icon, size = "md", className = "", children }: Props) {
  const sizing =
    size === "sm" ? "rounded-[8px] px-2 py-1 text-xs font-semibold" : "min-h-[34px] rounded-[12px] px-3 py-1 text-sm font-semibold";
  return (
    <span className={`inline-flex items-center gap-1.5 ${sizing} ${TONE_BAND[tone]} ${TONE_INK[tone]} ${className}`}>
      {typeof icon === "string" ? <span aria-hidden="true">{icon}</span> : icon}
      {children}
    </span>
  );
}

/** "Coming soon" marker for features that aren't built yet. */
export function ComingSoon() {
  return (
    <span className="eyebrow inline-flex items-center rounded-full bg-white/70 px-2.5 py-1">Coming soon</span>
  );
}
