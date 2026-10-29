// Shared pieces of the diary card and the reaction page.
import Link from "next/link";
import { SEVERITY_LABELS, type Severity } from "@/lib/allergen/codes";
import { SYMPTOM_LABELS, TREATMENT_LABELS } from "@/lib/diary/codes";
import { SEVERITY_DOTS, type ReactionRow } from "@/lib/diary/reactions";
import { LocalTime } from "@/components/ui/local-time";
import { Pill } from "@/components/ui/pill";
import { TONE_ACCENT, type Tone } from "@/components/ui/tones";

export const SEVERITY_TONE: Record<Severity, Tone> = { mild: "safe", moderate: "caution", severe: "unsafe" };

// Full class strings so Tailwind finds them. Ink colours swap for light text
// in dark mode, so the date pill uses the card colour for its text.
const SOLID: Record<Severity, string> = {
  mild: "bg-safe-ink text-card",
  moderate: "bg-caution-ink text-card",
  severe: "bg-unsafe-ink text-card",
};
const DOT: Record<Severity, string> = {
  mild: "bg-safe-ink",
  moderate: "bg-caution-ink",
  severe: "bg-unsafe-ink",
};
const WORD: Record<Severity, string> = {
  mild: "text-safe-ink",
  moderate: "text-caution-ink",
  severe: "text-unsafe-ink",
};

/** Filled dots out of 3 with the word next to them, so meaning never rests on colour. */
export function SeverityDots({ severity }: { severity: Severity }) {
  const filled = SEVERITY_DOTS[severity];
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="flex gap-1">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`size-3 rounded-full ${n <= filled ? DOT[severity] : "bg-line"}`} />
        ))}
      </span>
      <span className={`text-sm font-extrabold ${WORD[severity]}`}>{SEVERITY_LABELS[severity]}</span>
    </span>
  );
}

export function DatePill({ iso, severity }: { iso: string; severity: Severity }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black tracking-wide ${SOLID[severity]}`}>
      <LocalTime iso={iso} format="date" />
    </span>
  );
}

export function SymptomPills({ reaction }: { reaction: Pick<ReactionRow, "symptoms" | "severity"> }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {reaction.symptoms.map((s) => (
        <li key={s}>
          <Pill tone={SEVERITY_TONE[reaction.severity]} size="sm">
            {SYMPTOM_LABELS[s]}
          </Pill>
        </li>
      ))}
    </ul>
  );
}

/** One reaction in the diary list. The whole card opens the reaction. */
export function ReactionCard({ reaction }: { reaction: ReactionRow }) {
  return (
    <Link
      href={`/diary/${reaction.id}`}
      className={`block rounded-card border border-l-4 border-line bg-card p-4 shadow-card ${TONE_ACCENT[SEVERITY_TONE[reaction.severity]]}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DatePill iso={reaction.occurred_at} severity={reaction.severity} />
        <SeverityDots severity={reaction.severity} />
      </div>
      <dl className="mt-3 space-y-2 text-base">
        <div className="flex gap-2">
          <dt className="shrink-0 font-semibold text-muted">Food:</dt>
          <dd className="min-w-0 break-words font-black text-ink">{reaction.food}</dd>
        </div>
        <div className="flex items-start gap-2">
          <dt className="shrink-0 pt-0.5 font-semibold text-muted">
            {reaction.symptoms.length === 1 ? "Symptom:" : "Symptoms:"}
          </dt>
          <dd className="min-w-0">
            <SymptomPills reaction={reaction} />
          </dd>
        </div>
        {reaction.treatment && reaction.treatment !== "none" && (
          <div className="flex gap-2">
            <dt className="shrink-0 font-semibold text-muted">Treatment:</dt>
            <dd className="font-bold text-ink">{TREATMENT_LABELS[reaction.treatment]}</dd>
          </div>
        )}
      </dl>
    </Link>
  );
}
