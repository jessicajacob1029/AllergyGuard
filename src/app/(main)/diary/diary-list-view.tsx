import Link from "next/link";
import { formSuccessClass, primaryButtonClass } from "@/components/form-styles";
import { HeaderBand } from "@/components/ui/header-band";
import { PlusIcon } from "@/components/ui/icons";
import type { ReactionRow } from "@/lib/diary/reactions";
import { ReactionCard } from "./reaction-parts";

/** /diary: reactions newest first, with an add button. Pure view. */
export function DiaryListView({ reactions, deleted = false }: { reactions: readonly ReactionRow[]; deleted?: boolean }) {
  return (
    <main className="flex flex-1 flex-col">
      <HeaderBand
        eyebrow="Reaction tracker"
        title="My reactions"
        subtitle="Track your allergy reactions over time."
        aside={
          <Link
            href="/diary/new"
            aria-label="Add reaction"
            className="flex size-[50px] shrink-0 items-center justify-center rounded-[16px] bg-ink text-white shadow-button focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <PlusIcon className="size-6" />
          </Link>
        }
      />
      <div className="mx-auto w-full max-w-sm space-y-3 px-4 pb-6">
        {deleted && (
          <p role="status" className={formSuccessClass}>
            Reaction deleted.
          </p>
        )}

        {reactions.length === 0 ? (
          <div className="glass rounded-card p-6 text-center">
            <p className="text-xl font-semibold tracking-[-0.03em] text-ink">No reactions logged</p>
            <p className="mt-1 text-[15px] leading-relaxed text-muted">
              If you have a reaction, note what you ate and how it felt. It helps you and your doctor spot patterns.
            </p>
            <Link href="/diary/new" className={`mt-5 ${primaryButtonClass}`}>
              Log a reaction
            </Link>
          </div>
        ) : (
          <ul className="space-y-2.5" aria-label="Reactions, newest first">
            {reactions.map((r) => (
              <li key={r.id}>
                <ReactionCard reaction={r} />
              </li>
            ))}
          </ul>
        )}

      </div>
    </main>
  );
}
