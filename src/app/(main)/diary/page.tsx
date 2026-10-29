import type { Metadata } from "next";
import Link from "next/link";
import { formSuccessClass, primaryButtonClass } from "@/components/form-styles";
import { HeaderBand } from "@/components/ui/header-band";
import { APP_NAME } from "@/lib/constants";
import { REACTION_COLUMNS, readReactionRows } from "@/lib/diary/reactions";
import { requireDiaryProfile } from "./load";
import { ReactionCard } from "./reaction-parts";

export const metadata: Metadata = { title: `Reaction diary · ${APP_NAME}` };

export default async function DiaryPage({ searchParams }: PageProps<"/diary">) {
  const { deleted } = await searchParams;
  const { supabase, profile } = await requireDiaryProfile("/diary");

  const { data, error } = await supabase
    .from("reactions")
    .select(REACTION_COLUMNS)
    .eq("profile_id", profile.id)
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const reactions = readReactionRows(data ?? []);

  return (
    <main className="flex flex-1 flex-col bg-page">
      <HeaderBand title="My reactions" subtitle="Track your allergy reactions over time." />
      <div className="mx-auto w-full max-w-sm space-y-4 px-4 py-6">
        {deleted === "1" && (
          <p role="status" className={formSuccessClass}>
            Reaction deleted.
          </p>
        )}

        {reactions.length === 0 ? (
          <div className="rounded-card border border-line bg-card p-6 text-center shadow-card">
            <p className="text-lg font-black text-ink">No reactions logged</p>
            <p className="mt-1 text-sm font-semibold text-muted">
              If you have a reaction, note what you ate and how it felt. It helps you and your doctor spot patterns.
            </p>
          </div>
        ) : (
          <ul className="space-y-3" aria-label="Reactions, newest first">
            {reactions.map((r) => (
              <li key={r.id}>
                <ReactionCard reaction={r} />
              </li>
            ))}
          </ul>
        )}

        <Link href="/diary/new" className={primaryButtonClass}>
          <span aria-hidden="true">+</span> Add reaction
        </Link>
      </div>
    </main>
  );
}
