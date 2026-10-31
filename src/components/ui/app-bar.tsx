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
      className="flex h-11 items-center gap-1.5 whitespace-nowrap rounded-[12px] bg-emergency px-3 text-[13px] font-bold text-white shadow-[0_6px_14px_rgb(160_27_27/0.2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span aria-hidden="true">🚨</span>
      Emergency
    </a>
  );
}

/**
 * Sticky top bar on every page except /emergency itself. Signed out, it spans
 * the full width on laptops (logo left, Emergency right); signed in, it lines
 * up with the phone-width content. No Log in link: the pages have their own.
 */
export function AppBar({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/60 bg-white/35 backdrop-blur-xl">
      <div
        className={`mx-auto flex h-[68px] items-center justify-between gap-2 px-4 ${
          signedIn ? "max-w-sm" : "max-w-sm md:max-w-none md:px-8 lg:px-12"
        }`}
      >
        <Link href="/" className="flex min-h-11 items-center gap-2.5 text-base font-bold tracking-[-0.02em] text-ink">
          <AppIconTile size="sm" />
          <span>{APP_NAME}</span>
        </Link>
        <div className="flex items-center gap-1">
          {signedIn && <EmergencyCardSync />}
          <EmergencyButton />
        </div>
      </div>
    </header>
  );
}
