"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Ends this device's session (clears the auth cookies) and returns to login.
// A Server Action is a POST, so a link elsewhere can't log the user out.
// scope "local": only this device. Supabase's default ("global") would also end
// the session on the user's other phone or laptop.
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?logged_out=1");
}
