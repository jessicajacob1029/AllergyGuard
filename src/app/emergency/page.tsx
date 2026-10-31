import type { Metadata } from "next";
import { AlertIcon } from "@/components/ui/icons";
import { EmergencyCardView } from "./emergency-card-view";
import { frameClass } from "@/components/ui/frame";

export const metadata: Metadata = { title: "Emergency" };

// A static page: no server data, no auth. The service worker precaches its
// HTML at install, and the card itself is read from Dexie in the browser, so
// this works after a hard reload with no network at all.
export default function EmergencyPage() {
  return (
    <main className="flex flex-1 flex-col bg-[#fffaf8] pb-10">
      <div className={`${frameClass()} pt-3 desk:pt-8`}>
        {/* Plain <a>, a full document load: /emergency has its own layout
            tree, and when offline the service worker answers with /~offline. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="inline-flex h-11 items-center gap-1 text-[15px] font-bold text-[#7b1515] underline underline-offset-4"
        >
          <span aria-hidden="true">←</span> Back to AllergyGuard
        </a>
        <div className="mt-4">
          <span aria-hidden="true" className="flex size-[60px] items-center justify-center rounded-[18px] bg-emergency text-white">
            <AlertIcon className="size-8" />
          </span>
          <p className="eyebrow mt-6 text-[#4e3b3b]">Emergency</p>
          <h1 className="mt-2 text-[42px] font-medium leading-[0.98] tracking-[-0.055em] text-[#2a1717] max-[359px]:text-[36px]">
            Emergency allergy card
          </h1>
        </div>
        <EmergencyCardView />
      </div>
    </main>
  );
}
