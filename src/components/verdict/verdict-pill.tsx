import type { Verdict } from "@/lib/allergen/check";
import { AlertIcon, CheckIcon, XIcon } from "@/components/ui/icons";

const PILL: Record<Verdict, { word: string; className: string; Icon: typeof CheckIcon }> = {
  safe: { word: "Safe", className: "bg-safe-band text-safe-ink", Icon: CheckIcon },
  caution: { word: "Caution", className: "bg-caution-band text-caution-ink", Icon: AlertIcon },
  unsafe: { word: "Unsafe", className: "bg-unsafe-band text-unsafe-ink", Icon: XIcon },
};

/** Verdict label: always icon + word, never colour alone. Space Mono, 11px+. */
export function VerdictPill({ verdict, size = "sm" }: { verdict: Verdict; size?: "sm" | "md" }) {
  const { word, className, Icon } = PILL[verdict];
  const sizing = size === "md" ? "min-h-8 px-3 text-xs gap-1.5" : "min-h-[26px] px-2 text-[11px] gap-1";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-mono font-bold uppercase tracking-[0.04em] ${sizing} ${className}`}
    >
      <Icon className={size === "md" ? "size-4" : "size-3.5"} strokeWidth={2.4} />
      {word}
    </span>
  );
}
