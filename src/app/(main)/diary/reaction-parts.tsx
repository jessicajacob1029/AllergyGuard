// Shared pieces of the diary card and the reaction page (style v2).
import Link from "next/link";
import { ChevronRightIcon } from "@/components/ui/icons";
import { LocalTime } from "@/components/ui/local-time";
import { SEVERITY_LABELS, type Severity } from "@/lib/allergen/codes";
import { SYMPTOM_LABELS, TREATMENT_LABELS } from "@/lib/diary/codes";
import { SEVERITY_DOTS, type ReactionRow } from "@/lib/diary/reactions";
import type { Tone } from "@/components/ui/tones";

export const SEVERITY_TONE: Record<Severity, Tone> = { mild: "safe", moderate: "caution", severe: "unsafe" };

// Full class strings so Tailwind finds them.
const DOT: Record<Severity, string> = {
  mild: "bg-safe-ink",
  moderate: "bg-[#c77a00]",
  severe: "bg-unsafe-ink",
};

/** Filled dots out of 3 with the word next to them, so meaning never rests on colour. */
export function SeverityDots({ severity, suffix = "" }: { severity: Severity; suffix?: string }) {
  const filled = SEVERITY_DOTS[severity];
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="flex gap-[3px]">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`size-2 rounded-full ${n <= filled ? DOT[severity] : "bg-ink/15"}`} />
        ))}
      </span>
      <span className="text-sm font-semibold text-ink">
        {SEVERITY_LABELS[severity]}
        {suffix}
      </span>
    </span>
  );
}

/** Lilac date tile: day and month in Space Mono. The full date is there for screen readers. */
export function DateTile({ iso, large = false }: { iso: string; large?: boolean }) {
  return (
    <span
      className={`flex shrink-0 flex-col items-center justify-center rounded-[16px] bg-[#e4dfff] text-[#4c3d9e] ${
        large ? "h-20 w-[70px]" : "h-[65px] w-[55px]"
      }`}
    >
      <span aria-hidden="true" className={`font-mono font-bold leading-none ${large ? "text-[26px]" : "text-[21px]"}`}>
        <LocalTime iso={iso} format="dayOfMonth" />
      </span>
      <span aria-hidden="true" className="mt-1.5 font-mono text-[11px] font-bold">
        <LocalTime iso={iso} format="shortMonth" />
      </span>
      <span className="sr-only">
        <LocalTime iso={iso} format="date" />
      </span>
    </span>
  );
}

export function SymptomPills({ reaction }: { reaction: Pick<ReactionRow, "symptoms"> }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {reaction.symptoms.map((s) => (
        <li key={s} className="rounded-[8px] bg-[#ffe6d4] px-2 py-1 text-xs font-semibold text-[#5a3a24]">
          {SYMPTOM_LABELS[s]}
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
      className="glass grid min-h-[118px] grid-cols-[55px_1fr_auto] items-center gap-3.5 rounded-[22px] p-4 text-ink focus-visible:outline-2 focus-visible:outline-primary"
    >
      <DateTile iso={reaction.occurred_at} />
      <dl className="min-w-0 space-y-2">
        <div>
          <dt className="sr-only">Food:</dt>
          <dd className="break-words text-base font-bold">{reaction.food}</dd>
        </div>
        <div>
          <dt className="sr-only">Severity:</dt>
          <dd>
            <SeverityDots severity={reaction.severity} />
          </dd>
        </div>
        <div>
          <dt className="sr-only">{reaction.symptoms.length === 1 ? "Symptom:" : "Symptoms:"}</dt>
          <dd>
            <SymptomPills reaction={reaction} />
          </dd>
        </div>
        {reaction.treatment && reaction.treatment !== "none" && (
          <div className="text-sm text-muted">
            <dt className="inline">Treatment: </dt>
            <dd className="inline font-semibold text-ink">{TREATMENT_LABELS[reaction.treatment]}</dd>
          </div>
        )}
      </dl>
      <ChevronRightIcon className="size-[18px] text-muted" />
    </Link>
  );
}
