import type { Metadata } from "next";
import { emergencyButtonClass } from "@/components/form-styles";
import { OfflineIcon } from "@/components/ui/icons";
import { StateScreen } from "@/components/ui/state-screen";

export const metadata: Metadata = { title: "Offline" };

// Served by the service worker when a page can't load without a network.
// Static and precached; contains no user data.
export default function OfflinePage() {
  return (
    <StateScreen
      icon={<OfflineIcon className="size-12" />}
      orb="grey"
      code="No connection"
      title="You're offline"
      actions={
        // Plain <a>: a full load the service worker answers from its cache.
        <a href="/emergency" className={`${emergencyButtonClass} min-h-16 text-lg`}>
          <span aria-hidden="true">🚨</span>
          Open emergency card
        </a>
      }
    >
      This page needs an internet connection. Your emergency card works offline.
    </StateScreen>
  );
}
