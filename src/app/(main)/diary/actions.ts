"use server";

import { redirect } from "next/navigation";
import { isUuid, validateReaction, type ReactionErrors, type ReactionInput } from "@/lib/diary/reactions";
import { requireDiaryProfile } from "./load";

export type ReactionActionResult = { error?: string; errors?: ReactionErrors };

const SAVE_FAILED = "We couldn't save the reaction. Check your connection and try again.";

/**
 * Adds a reaction (id null) or edits one, then opens it. The form already
 * checked the input; it is checked again here because the browser can't be
 * trusted. RLS limits writes to the user's own profile and own scans.
 */
export async function saveReaction(input: ReactionInput, id: string | null): Promise<ReactionActionResult> {
  if (id !== null && !isUuid(id)) return { error: "We couldn't find that reaction." };
  const { supabase, profile } = await requireDiaryProfile(id ? `/diary/${id}/edit` : "/diary/new");

  const checked = validateReaction(input, new Date());
  if (!checked.ok) return { errors: checked.errors };

  const query = id
    ? supabase.from("reactions").update(checked.value).eq("id", id)
    : supabase.from("reactions").insert({ ...checked.value, profile_id: profile.id });
  const { data, error } = await query.select("id").maybeSingle();
  if (error) {
    console.error("Could not save reaction", error);
    return { error: SAVE_FAILED };
  }
  if (!data) return { error: "We couldn't find that reaction. It may have been deleted." };
  redirect(`/diary/${data.id}?saved=1`);
}

export async function deleteReaction(id: string): Promise<ReactionActionResult> {
  if (!isUuid(id)) return { error: "We couldn't find that reaction." };
  const { supabase } = await requireDiaryProfile(`/diary/${id}`);
  const { data, error } = await supabase.from("reactions").delete().eq("id", id).select("id");
  if (error) {
    console.error("Could not delete reaction", error);
    return { error: "We couldn't delete the reaction. Check your connection and try again." };
  }
  if (!data || data.length === 0) return { error: "We couldn't find that reaction. It may already be deleted." };
  redirect("/diary?deleted=1");
}
