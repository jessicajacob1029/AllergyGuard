"use client";

import { signOut } from "@/app/auth/actions";
import { clearEmergencyCards } from "@/lib/offline/emergency-card";
import { unsubscribeThisDevice } from "@/lib/push/subscribe";
import { createClient } from "@/lib/supabase/client";

// The only place the offline emergency card is wiped: an explicit sign-out
// (Phase 2 decision). Session expiry, a failed token refresh or being offline
// never reach this code, so they keep the card.
//
// No runtime cache needs clearing here: the service worker never stores
// signed-in pages or API responses (see src/app/sw.ts).
//
// Medication reminders (Phase 7) stop on this device too, so a shared phone
// doesn't keep showing the previous person's reminders. Runs before the
// sign-out, while the session can still delete the device's row.
async function clearThenSignOut() {
  try {
    await clearEmergencyCards();
  } catch (error) {
    console.error("Could not clear the offline emergency card", error);
  }
  await unsubscribeThisDevice(createClient()); // never throws
  await signOut();
}

export function SignOutButton({ className }: { className: string }) {
  return (
    <form action={clearThenSignOut}>
      <button type="submit" className={className}>
        Log out
      </button>
    </form>
  );
}
