import type { Metadata } from "next";
import { HeaderBand } from "@/components/ui/header-band";
import { EmergencyCardView } from "./emergency-card-view";

export const metadata: Metadata = { title: "Emergency" };

// A static page: no server data, no auth. The service worker precaches its
// HTML at install, and the card itself is read from Dexie in the browser, so
// this works after a hard reload with no network at all.
export default function EmergencyPage() {
  return (
    <main className="flex flex-1 flex-col bg-page pb-10">
      <HeaderBand
        centered
        title="Emergency"
        top={
          <div className="flex w-full flex-col items-center">
            {/* Plain <a>, a full document load: /emergency has its own layout
                tree, and when offline the service worker answers with /~offline. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="inline-flex h-11 items-center self-start text-sm font-extrabold text-unsafe-ink underline underline-offset-4"
            >
              ← Back to AllergyGuard
            </a>
            <span aria-hidden="true" className="text-5xl">
              🚨
            </span>
          </div>
        }
      />
      <div className="mx-auto w-full max-w-sm px-4">
        <EmergencyCardView />
      </div>
    </main>
  );
}
