import type { Metadata } from "next";
import { APP_NAME } from "@/lib/constants";
import { REACTION_COLUMNS, readReactionRows } from "@/lib/diary/reactions";
import { requireDiaryProfile } from "./load";
import { DiaryListView } from "./diary-list-view";

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

  return <DiaryListView reactions={reactions} deleted={deleted === "1"} />;
}
