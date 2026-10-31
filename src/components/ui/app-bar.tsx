import Link from "next/link";
import { EmergencyCardSync } from "@/components/emergency-card-sync";
import { APP_NAME } from "@/lib/constants";
import { DesktopNav } from "./desktop-nav";
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
      className="flex h-11 items-center whitespace-nowrap rounded-[12px] bg-emergency px-3.5 text-[13px] font-bold text-white shadow-[0_6px_14px_rgb(160_27_27/0.2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      Emergency
    </a>
  );
}

/**
 * Sticky top bar on every page except /emergency itself. No Log in link: the
 * pages have their own. Signed out, it spans the full width from 768px. Signed
 * in, from 900px it spans the full width with the main nav in the middle
 * (the bottom bar is phones only).
 */
export function AppBar({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/60 bg-white/35 backdrop-blur-xl">
      <div
        className={`mx-auto flex h-[68px] items-center justify-between gap-2 px-4 ${
          signedIn
            ? "max-w-sm desk:grid desk:max-w-none desk:grid-cols-[1fr_auto_1fr] desk:px-8"
            : "max-w-sm md:max-w-none md:px-8 lg:px-12"
        }`}
      >
        <Link href="/" className="flex min-h-11 items-center gap-2.5 justify-self-start text-base font-bold tracking-[-0.02em] text-ink">
          <AppIconTile size="sm" />
          <span>{APP_NAME}</span>
        </Link>
        {signedIn && <DesktopNav />}
        <div className="flex items-center gap-1 justify-self-end">
          {signedIn && <EmergencyCardSync />}
          <EmergencyButton />
        </div>
      </div>
    </header>
  );
}
