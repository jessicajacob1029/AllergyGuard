import type { Metadata } from "next";
import { emergencyButtonClass } from "@/components/form-styles";
import { HeaderBand } from "@/components/ui/header-band";
import { AppIconTile } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Offline" };

// Served by the service worker when a page can't load without a network.
// Static and precached; contains no user data.
export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col bg-page">
      <HeaderBand centered top={<AppIconTile size="lg" />} title="You're offline" />
      <div className="mx-auto mt-8 w-full max-w-sm space-y-6 px-4 text-center">
        <p className="text-base font-semibold text-muted">
          This page needs an internet connection. Your emergency card works offline.
        </p>
        {/* Plain <a>: a full load the service worker answers from its cache. */}
        <a href="/emergency" className={`${emergencyButtonClass} min-h-16 text-lg`}>
          <span aria-hidden="true">🚨</span>
          Open emergency card
        </a>
      </div>
    </main>
  );
}
