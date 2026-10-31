import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { APP_NAME } from "@/lib/constants";
import { loadContacts, loadOwnProfile } from "@/lib/profile/load";
import { loadReminderSettings } from "@/lib/reminders/settings";
import { createClient } from "@/lib/supabase/server";
import { ProfileView } from "./profile-view";

export const metadata: Metadata = {
  title: `Your profile · ${APP_NAME}`,
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login?next=/profile");

  const bundle = await loadOwnProfile(supabase);
  if (!bundle || bundle.profile.onboarding_completed_at === null) redirect("/onboarding");
  const [contacts, reminderSettings] = await Promise.all([
    loadContacts(supabase, bundle.profile.id),
    loadReminderSettings(supabase, data.claims.sub),
  ]);

  return (
    <ProfileView
      bundle={bundle}
      contacts={contacts}
      reminders={{
        ownerId: data.claims.sub,
        initial: reminderSettings,
        email: typeof data.claims.email === "string" ? data.claims.email : null,
        // Public by design, but read on the server: the browser only gets the two
        // Supabase variables (CLAUDE.md), so this is passed down as a prop.
        vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
      }}
    />
  );
}
