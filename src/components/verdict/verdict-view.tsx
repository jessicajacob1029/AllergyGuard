import type { ReactNode } from "react";
import type { CheckResult, CheckWarning, Verdict } from "@/lib/allergen/check";
import { HeaderBand } from "@/components/ui/header-band";
import { LocalTime } from "@/components/ui/local-time";
import { AlertIcon, CheckIcon, XIcon } from "@/components/ui/icons";
import { Pill } from "@/components/ui/pill";
import { SectionCard } from "@/components/ui/section-card";
import type { Tone } from "@/components/ui/tones";
import { highlightSegments } from "./highlight";

// Shared by barcode (Phase 4) and label photo (Phase 5) results. Every verdict
// shows its word and an icon, never colour alone (CLAUDE.md "Verdicts").

const VERDICT: Record<
  Verdict,
  { word: string; tone: Tone; icon: ReactNode; subtitle: string; why: string; circle: string }
> = {
  unsafe: {
    word: "Unsafe",
    tone: "unsafe",
    icon: <XIcon className="size-11" />,
    circle: "bg-[linear-gradient(145deg,#fee4e0,#ed9b95)] text-[#8a1b1b]",
    subtitle: "One of your allergens was found.",
    why: "Why is it unsafe?",
  },
  caution: {
    word: "Caution",
    tone: "caution",
    icon: <AlertIcon className="size-11" />,
    circle: "bg-[linear-gradient(145deg,#fff3ca,#ffc76d)] text-[#694400]",
    subtitle: "We can't be sure this is safe for you.",
    why: "Why caution?",
  },
  safe: {
    word: "Safe",
    tone: "safe",
    icon: <CheckIcon className="size-11" />,
    circle: "bg-[linear-gradient(145deg,#dcf5e8,#9edaba)] text-[#125c3b]",
    subtitle: "None of your allergens were found.",
    why: "Why is it safe?",
  },
};

export type VerdictProduct = {
  found: boolean;
  name: string | null;
  brands: string | null;
  barcode: string;
};

type Props = {
  result: CheckResult;
  /** Barcode results; null for a label photo. */
  product: VerdictProduct | null;
  /** Reasons the source data may be incomplete. */
  notes?: readonly string[];
  /** ISO time of the check. */
  checkedAt: string;
  /** Data attribution shown at the bottom, e.g. Open Food Facts. */
  attribution?: ReactNode;
  actions: ReactNode;
};

function warningPill(w: CheckWarning): ReactNode {
  switch (w.kind) {
    case "possible_source":
      return `“${w.text}” may contain ${w.allergen}`;
    case "free_from_claim":
      return `Claim: “${w.text}”`;
    case "missing_text":
      return "No ingredient list";
    case "incomplete":
      return "Data may be incomplete";
    case "low_confidence":
      return "Text not read clearly";
    case "no_allergens":
      return "No allergens in your profile";
  }
}


/** Declared matches the ingredient text already shows (same allergen and kind) add nothing. */
function visibleMatches(matches: CheckResult["matches"]) {
  const inText = new Set(matches.filter((m) => m.source === "ingredients").map((m) => `${m.allergen}|${m.kind}`));
  return matches.filter((m) => m.source === "ingredients" || !inText.has(`${m.allergen}|${m.kind}`));
}

export function VerdictView({ result, product, notes = [], checkedAt, attribution, actions }: Props) {
  const v = VERDICT[result.verdict];
  const shownMatches = visibleMatches(result.matches);
  const segments = highlightSegments(result.rawText, result.matches);
  const hasMay = segments.some((s) => s.kind === "may_contain");
  const hasContains = segments.some((s) => s.kind === "contains");

  return (
    <main className="flex flex-1 flex-col">
      <HeaderBand
        centered
        title={<span className="text-[44px] tracking-[-0.05em]">{v.word}</span>}
        subtitle={v.subtitle}
        top={
          <span className={`flex size-[92px] items-center justify-center rounded-full ${v.circle}`} aria-hidden="true">
            {v.icon}
          </span>
        }
      />

      <div className="mx-auto w-full max-w-sm space-y-3.5 px-4 pb-6">
        {product && (
          <div className="glass gradient-soft rounded-card p-6">
            <p className="eyebrow">Scanned product</p>
            <p className="mt-2 text-[28px] font-medium leading-tight tracking-[-0.045em] text-ink">
              {product.name ?? (product.found ? "Unnamed product" : "Product not found")}
            </p>
            {product.brands && <p className="mt-1 text-[15px] text-muted">{product.brands}</p>}
            <p className="mt-3 font-mono text-xs font-bold tracking-[0.15em] text-ink">
              <span className="sr-only">Barcode </span>
              {product.barcode}
            </p>
            {!product.found && (
              <p className="mt-4 rounded-[14px] bg-caution-band p-3 text-sm font-bold text-caution-ink">
                This product isn&apos;t on Open Food Facts, so we have no ingredients to check.
              </p>
            )}
          </div>
        )}

        <SectionCard tone={v.tone} label={v.why}>
          <p className="text-[19px] font-semibold leading-snug tracking-[-0.02em] text-ink">{result.explanation}</p>
          {(shownMatches.length > 0 || result.warnings.length > 0) && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="What triggered it">
              {shownMatches.map((m, i) => (
                <li key={`m${i}`}>
                  <Pill tone={m.kind === "contains" ? "unsafe" : "caution"} size="sm">
                    {m.allergen}: {m.kind === "contains" ? "" : "may contain "}“{m.text}”
                    {m.source === "declared" ? " (allergen list)" : ""}
                  </Pill>
                </li>
              ))}
              {result.warnings.map((w, i) => (
                <li key={`w${i}`}>
                  <Pill tone="caution" size="sm">
                    {warningPill(w)}
                  </Pill>
                </li>
              ))}
            </ul>
          )}
          {notes.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard tone="neutral" label="Ingredients as received">
          {result.rawText.trim() === "" ? (
            <p className="text-[15px] text-muted">No ingredient text was available.</p>
          ) : (
            <>
              <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.7] text-[#3f3a44]">
                {segments.map((s, i) =>
                  s.kind === null ? (
                    <span key={i}>{s.text}</span>
                  ) : (
                    <mark
                      key={i}
                      className={
                        s.kind === "contains"
                          ? "rounded-[4px] bg-unsafe-band px-1 font-bold text-unsafe-ink underline decoration-2"
                          : "rounded-[4px] bg-caution-band px-1 font-bold text-caution-ink underline decoration-dotted decoration-2"
                      }
                    >
                      {s.text}
                    </mark>
                  ),
                )}
              </p>
              {(hasContains || hasMay) && (
                <p className="mt-3 text-sm text-muted">
                  {hasContains && "Solid underline: your allergen. "}
                  {hasMay && "Dotted underline: may contain."}
                </p>
              )}
            </>
          )}
        </SectionCard>

        <div className="space-y-3">{actions}</div>

        <div className="space-y-1 px-2 text-center text-sm text-muted">
          <p>Checked against your allergies on <LocalTime iso={checkedAt} format="checkedAt" />.</p>
          {attribution && <p>{attribution}</p>}
          <p>AllergyGuard is an aid, not medical advice. Always read the label.</p>
        </div>
      </div>
    </main>
  );
}
