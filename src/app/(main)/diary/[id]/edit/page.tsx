import type { Metadata } from "next";
import { HeaderBand } from "@/components/ui/header-band";
import { APP_NAME } from "@/lib/constants";
import { toReactionInput } from "@/lib/diary/reactions";
import { loadReactionOr404, requireDiaryProfile } from "../../load";
import { ReactionForm } from "../../reaction-form";

export const metadata: Metadata = { title: `Edit reaction · ${APP_NAME}` };

export default async function EditReactionPage({ params }: PageProps<"/diary/[id]/edit">) {
  const { id } = await params;
  const { supabase } = await requireDiaryProfile(`/diary/${id}/edit`);
  const reaction = await loadReactionOr404(supabase, id);

  return (
    <main className="flex flex-1 flex-col bg-page">
      <HeaderBand title="Edit reaction" />
      <div className="mx-auto w-full max-w-sm px-4 py-6">
        <ReactionForm
          reactionId={reaction.id}
          initial={toReactionInput(reaction)}
          scanLabel={null}
          cancelHref={`/diary/${reaction.id}`}
        />
      </div>
    </main>
  );
}
