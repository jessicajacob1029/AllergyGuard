import type { Metadata } from "next";
import Link from "next/link";
import { formSuccessClass, linkClass, primaryButtonClass, tertiaryButtonClass } from "@/components/form-styles";
import { HeaderBand } from "@/components/ui/header-band";
import { LocalTime } from "@/components/ui/local-time";
import { SectionCard } from "@/components/ui/section-card";
import { APP_NAME } from "@/lib/constants";
import { TREATMENT_LABELS } from "@/lib/diary/codes";
import { DeleteReaction } from "../delete-reaction";
import { loadReactionOr404, requireDiaryProfile } from "../load";
import { SEVERITY_TONE, SeverityDots, SymptomPills } from "../reaction-parts";

export const metadata: Metadata = { title: `Reaction · ${APP_NAME}` };

export default async function ReactionPage({ params, searchParams }: PageProps<"/diary/[id]">) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const { supabase } = await requireDiaryProfile(`/diary/${id}`);
  const reaction = await loadReactionOr404(supabase, id);
  const tone = SEVERITY_TONE[reaction.severity];

  return (
    <main className="flex flex-1 flex-col bg-page">
      <HeaderBand
        tone="medication"
        title={reaction.food}
        subtitle={<LocalTime iso={reaction.occurred_at} format="dateTime" />}
      />
      <div className="mx-auto w-full max-w-sm space-y-4 px-4 py-6">
        {saved === "1" && (
          <p role="status" className={formSuccessClass}>
            Reaction saved.
          </p>
        )}

        <SectionCard tone={tone} accent>
          <dl className="space-y-4">
            <div>
              <dt className="text-xs font-extrabold uppercase tracking-wider text-muted">How bad</dt>
              <dd className="mt-1">
                <SeverityDots severity={reaction.severity} />
              </dd>
            </div>
            <div>
              <dt className="text-xs font-extrabold uppercase tracking-wider text-muted">Symptoms</dt>
              <dd className="mt-1">
                <SymptomPills reaction={reaction} />
              </dd>
            </div>
            <div>
              <dt className="text-xs font-extrabold uppercase tracking-wider text-muted">Treatment</dt>
              <dd className="mt-1 text-base font-bold text-ink">
                {reaction.treatment ? TREATMENT_LABELS[reaction.treatment] : "Not recorded"}
              </dd>
            </div>
            {reaction.notes && (
              <div>
                <dt className="text-xs font-extrabold uppercase tracking-wider text-muted">Notes</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-base text-ink">{reaction.notes}</dd>
              </div>
            )}
            {reaction.scan_id && (
              <div>
                <dt className="text-xs font-extrabold uppercase tracking-wider text-muted">Scan</dt>
                <dd className="mt-1">
                  <Link href={`/scans/${reaction.scan_id}`} className={linkClass}>
                    View the scan result
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </SectionCard>

        <Link href={`/diary/${reaction.id}/edit`} className={primaryButtonClass}>
          Edit
        </Link>
        <Link href="/diary" className={tertiaryButtonClass}>
          Back to diary
        </Link>
        <DeleteReaction id={reaction.id} />
      </div>
    </main>
  );
}
