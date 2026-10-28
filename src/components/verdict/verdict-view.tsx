import type { ReactNode } from "react";
import type { CheckResult, CheckWarning, Verdict } from "@/lib/allergen/check";
import { HeaderBand } from "@/components/ui/header-band";
import { AlertIcon, CheckIcon, XIcon } from "@/components/ui/icons";
import { Pill } from "@/components/ui/pill";
import { SectionCard } from "@/components/ui/section-card";
import type { Tone } from "@/components/ui/tones";
import { highlightSegments } from "./highlight";

// Shared by barcode (Phase 4) and label photo (Phase 5) results. Every verdict
// shows its word and an icon, never colour alone (CLAUDE.md "Verdicts").

const VERDICT: Record<Verdict, { word: string; tone: Tone; icon: ReactNode; subtitle: string; why: string }> = {
  unsafe: {
    word: "Unsafe",
    tone: "unsafe",
    icon: <XIcon className="size-10" />,
    subtitle: "One of your allergens was found.",
    why: "Why is it unsafe?",
  },
  caution: {
    word: "Caution",
    tone: "caution",
    icon: <AlertIcon className="size-10" />,
    subtitle: "We can't be sure this is safe for you.",
    why: "Why caution?",
  },
  safe: {
    word: "Safe",
    tone: "safe",
    icon: <CheckIcon className="size-10" />,
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
  /** Heading of the checked-text card. */
  textLabel?: string;
  /** Label photos: the text as first read, shown when the user changed it. */
  originalText?: string | null;
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

function formatCheckedAt(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

/** Declared matches the ingredient text already shows (same allergen and kind) add nothing. */
function visibleMatches(matches: CheckResult["matches"]) {
  const inText = new Set(matches.filter((m) => m.source === "ingredients").map((m) => `${m.allergen}|${m.kind}`));
  return matches.filter((m) => m.source === "ingredients" || !inText.has(`${m.allergen}|${m.kind}`));
}

export function VerdictView({
  result,
  product,
  notes = [],
  checkedAt,
  attribution,
  textLabel = "Ingredients as received",
  originalText = null,
  actions,
}: Props) {
  const v = VERDICT[result.verdict];
  const shownMatches = visibleMatches(result.matches);
  const segments = highlightSegments(result.rawText, result.matches);
  const hasMay = segments.some((s) => s.kind === "may_contain");
  const hasContains = segments.some((s) => s.kind === "contains");

  return (
    <main className="flex flex-1 flex-col bg-page">
      <HeaderBand
        tone={v.tone}
        centered
        title={<span className="text-[34px] uppercase tracking-wide">{v.word}</span>}
        subtitle={v.subtitle}
        top={
          <span className="flex size-16 items-center justify-center rounded-full bg-card shadow-card" aria-hidden="true">
            <span className={v.tone === "safe" ? "text-safe-ink" : v.tone === "caution" ? "text-caution-ink" : "text-unsafe-ink"}>
              {v.icon}
            </span>
          </span>
        }
      />

      <div className="mx-auto w-full max-w-sm space-y-6 px-4 py-6">
        {product && (
          <SectionCard tone={v.tone} accent>
            <p className="text-lg font-black text-ink">
              {product.name ?? (product.found ? "Unnamed product" : "Product not found")}
            </p>
            {product.brands && <p className="text-sm font-semibold text-muted">{product.brands}</p>}
            <p className="mt-1 text-sm font-semibold text-muted">Barcode {product.barcode}</p>
            {!product.found && (
              <p className="mt-3 rounded-field bg-caution-band p-3 text-sm font-bold text-caution-ink">
                This product isn&apos;t on Open Food Facts, so we have no ingredients to check.
              </p>
            )}
          </SectionCard>
        )}

        <SectionCard tone={v.tone} label={v.why}>
          <p className="text-base font-semibold text-ink">{result.explanation}</p>
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
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm font-semibold text-muted">
              {notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard tone="neutral" label={textLabel}>
          {result.rawText.trim() === "" ? (
            <p className="text-base font-semibold text-muted">No ingredient text was available.</p>
          ) : (
            <>
              <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-ink">
                {segments.map((s, i) =>
                  s.kind === null ? (
                    <span key={i}>{s.text}</span>
                  ) : (
                    <mark
                      key={i}
                      className={
                        s.kind === "contains"
                          ? "rounded bg-unsafe-band px-0.5 font-black text-unsafe-ink underline decoration-2"
                          : "rounded bg-caution-band px-0.5 font-extrabold text-caution-ink underline decoration-dotted decoration-2"
                      }
                    >
                      {s.text}
                    </mark>
                  ),
                )}
              </p>
              {(hasContains || hasMay) && (
                <p className="mt-3 text-xs font-semibold text-muted">
                  {hasContains && "Solid underline: your allergen. "}
                  {hasMay && "Dotted underline: may contain."}
                </p>
              )}
            </>
          )}
          {originalText !== null && (
            <details className="mt-4 rounded-field border border-line p-3">
              <summary className="cursor-pointer text-sm font-extrabold text-primary-ink">
                You edited this text. Show what was read from the photo
              </summary>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">{originalText}</p>
            </details>
          )}
        </SectionCard>

        <div className="space-y-3">{actions}</div>

        <div className="space-y-1 text-center text-xs font-semibold text-muted">
          <p>Checked against your allergies on {formatCheckedAt(checkedAt)}.</p>
          {attribution && <p>{attribution}</p>}
          <p>AllergyGuard is an aid, not medical advice. Always read the label.</p>
        </div>
      </div>
    </main>
  );
}
