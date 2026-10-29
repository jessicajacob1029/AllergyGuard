import Link from "next/link";
import { EmergencyCardSync } from "@/components/emergency-card-sync";
import { APP_NAME } from "@/lib/constants";
import { AppIconTile } from "./icons";

/**
 * The Emergency button on every screen. A plain <a>, not <Link>: <Link>
 * fetches the RSC payload over the network, which fails offline. A full
 * document load is answered from the service worker's precache instead.
 */
export function EmergencyButton() {
  return (
    <a
      href="/emergency"
      className="flex h-11 items-center gap-1.5 whitespace-nowrap rounded-[13px] bg-emergency px-3.5 text-sm font-bold uppercase tracking-wide text-white shadow-[0_8px_18px_rgb(160_27_27/0.21)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span aria-hidden="true">🚨</span>
      Emergency
    </a>
  );
}

/** Sticky top bar on every page except /emergency itself. */
export function AppBar({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-20 bg-page/75 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] max-w-sm items-center justify-between gap-2 px-4">
        <Link href="/" className="flex min-h-11 items-center gap-2.5 text-base font-bold tracking-[-0.02em] text-ink">
          <AppIconTile size="sm" />
          {/* Icon only on narrow phones so Log in and Emergency fit on one line. */}
          <span className="max-[399px]:sr-only">{APP_NAME}</span>
        </Link>
        <div className="flex items-center gap-1">
          {signedIn ? (
            <EmergencyCardSync />
          ) : (
            <Link href="/login" className="flex h-11 items-center whitespace-nowrap px-2 text-sm font-bold text-primary-ink">
              Log in
            </Link>
          )}
          <EmergencyButton />
        </div>
      </div>
    </header>
  );
}
