import type { Metadata } from "next";
import Link from "next/link";
import { emergencyButtonClass, primaryButtonClass } from "@/components/form-styles";
import { ScanIcon } from "@/components/ui/icons";
import { StateScreen } from "@/components/ui/state-screen";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: `Page not found · ${APP_NAME}` };

// Unknown URLs and notFound() (e.g. a scan result that isn't yours). Never a
// dead end: home, and the emergency card one tap away.
export default function NotFound() {
  return (
    <StateScreen
      icon={<ScanIcon className="size-12" />}
      orb="peach"
      code="Error 404"
      title="Page not found"
      actions={
        <>
          <Link href="/" className={primaryButtonClass}>
            Go to home
          </Link>
          {/* Plain <a>: /emergency must load from the service worker offline. */}
          <a href="/emergency" className={emergencyButtonClass}>
            <span aria-hidden="true">🚨</span>
            Open emergency card
          </a>
        </>
      }
    >
      This page doesn&apos;t exist, or it isn&apos;t yours to see. Check the link, or start again from home.
    </StateScreen>
  );
}
