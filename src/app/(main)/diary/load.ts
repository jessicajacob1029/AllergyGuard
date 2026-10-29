import { notFound, redirect } from "next/navigation";
import { isUuid, REACTION_COLUMNS, readReactionRows, type ReactionRow } from "@/lib/diary/reactions";
import { loadOwnProfile } from "@/lib/profile/load";
import { createClient } from "@/lib/supabase/server";

/** Signed in with onboarding done, or redirected. `next` is where Log in returns to. */
export async function requireDiaryProfile(next: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(`/login?next=${encodeURIComponent(next)}`);
  const bundle = await loadOwnProfile(supabase);
  if (!bundle || bundle.profile.onboarding_completed_at === null) redirect("/onboarding");
  return { supabase, profile: bundle.profile };
}

/** One of the user's reactions, or the 404 page (RLS hides everyone else's). */
export async function loadReactionOr404(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<ReactionRow> {
  if (!isUuid(id)) notFound();
  const { data, error } = await supabase.from("reactions").select(REACTION_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  const [reaction] = readReactionRows(data ? [data] : []);
  if (!reaction) notFound();
  return reaction;
}
