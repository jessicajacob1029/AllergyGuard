import Link from "next/link";
import type { ReactNode } from "react";
import { formSuccessClass, linkClass, primaryButtonClass, tertiaryButtonClass } from "@/components/form-styles";
import { EditIcon } from "@/components/ui/icons";
import { LocalTime } from "@/components/ui/local-time";
import { TREATMENT_LABELS } from "@/lib/diary/codes";
import type { ReactionRow } from "@/lib/diary/reactions";
import { DeleteReaction } from "../delete-reaction";
import { DateTile, SeverityDots, SymptomPills } from "../reaction-parts";

/** One reaction: hero with date, food and severity, then details and actions. Pure view. */
export function ReactionDetailView({ reaction, saved = false }: { reaction: ReactionRow; saved?: boolean }) {
  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-sm space-y-3.5 px-4 pb-6 pt-4">
        {saved && (
          <p role="status" className={formSuccessClass}>
            Reaction saved.
          </p>
        )}

        <section className="glass gradient-reaction rounded-[28px] p-6 text-center">
          <div className="flex justify-center">
            <DateTile iso={reaction.occurred_at} large />
          </div>
          <p className="eyebrow mt-5">
            <LocalTime iso={reaction.occurred_at} format="dateTime" />
          </p>
          <h1 className="mt-2 break-words text-[36px] font-medium leading-[1.02] tracking-[-0.05em] text-ink">
            {reaction.food}
          </h1>
          <p className="mt-3">
            <SeverityDots severity={reaction.severity} suffix=" reaction" />
          </p>
        </section>

        <section aria-label="Details" className="glass rounded-card px-5 py-1">
          <dl>
            <Detail label="Symptoms">
              <SymptomPills reaction={reaction} />
            </Detail>
            <Detail label="Treatment">
              <span className="text-[15px] text-ink">
                {reaction.treatment ? TREATMENT_LABELS[reaction.treatment] : "Not recorded"}
              </span>
            </Detail>
            {reaction.notes && (
              <Detail label="Notes">
                <span className="block whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink">
                  {reaction.notes}
                </span>
              </Detail>
            )}
            {reaction.scan_id && (
              <Detail label="Scan">
                <Link href={`/scans/${reaction.scan_id}`} className={linkClass}>
                  View the scan result
                </Link>
              </Detail>
            )}
          </dl>
        </section>

        <div className="flex flex-wrap gap-2.5">
          <Link href={`/diary/${reaction.id}/edit`} className={`${primaryButtonClass} flex-1 basis-0`}>
            <EditIcon className="size-[18px]" />
            Edit
          </Link>
          <DeleteReaction id={reaction.id} />
        </div>
        <Link href="/diary" className={tertiaryButtonClass}>
          Back to diary
        </Link>
      </div>
    </main>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-ink/10 py-4 last:border-b-0">
      <dt className="eyebrow mb-2">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
