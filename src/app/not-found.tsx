import type { Metadata } from "next";
import Link from "next/link";
import { emergencyButtonClass, primaryButtonClass } from "@/components/form-styles";
import { HeaderBand } from "@/components/ui/header-band";
import { AppIconTile } from "@/components/ui/icons";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: `Page not found · ${APP_NAME}` };

// Unknown URLs and notFound() (e.g. a scan result that isn't yours). Never a
// dead end: home, and the emergency card one tap away.
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col bg-page">
      <HeaderBand centered top={<AppIconTile size="lg" />} title="Page not found" />
      <div className="mx-auto mt-8 w-full max-w-sm space-y-4 px-4 text-center">
        <p className="text-base font-semibold text-muted">
          This page doesn&apos;t exist, or it isn&apos;t yours to see. Check the link, or start again from home.
        </p>
        <Link href="/" className={primaryButtonClass}>
          Go to home
        </Link>
        {/* Plain <a>: /emergency must load from the service worker offline. */}
        <a href="/emergency" className={emergencyButtonClass}>
          <span aria-hidden="true">🚨</span>
          Open emergency card
        </a>
      </div>
    </main>
  );
}
