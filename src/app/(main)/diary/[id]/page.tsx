import type { Metadata } from "next";
import { APP_NAME } from "@/lib/constants";
import { loadReactionOr404, requireDiaryProfile } from "../load";
import { ReactionDetailView } from "./reaction-detail-view";

export const metadata: Metadata = { title: `Reaction · ${APP_NAME}` };

export default async function ReactionPage({ params, searchParams }: PageProps<"/diary/[id]">) {
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);
  const { supabase } = await requireDiaryProfile(`/diary/${id}`);
  const reaction = await loadReactionOr404(supabase, id);
  return <ReactionDetailView reaction={reaction} saved={saved === "1"} />;
}
