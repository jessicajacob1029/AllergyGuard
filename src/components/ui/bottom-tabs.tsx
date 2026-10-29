"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { DiaryIcon, HomeIcon, PersonIcon, ScanIcon } from "./icons";

type Tab = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  href: string;
  /** Other paths that belong to this tab (scan results and history belong to Scan). */
  also?: readonly string[];
};

export const TABS: readonly Tab[] = [
  { label: "Home", icon: HomeIcon, href: "/" },
  { label: "Scan", icon: ScanIcon, href: "/scan", also: ["/scans"] },
  { label: "Diary", icon: DiaryIcon, href: "/diary" },
  { label: "Profile", icon: PersonIcon, href: "/profile" },
];

/** Screens with their own flow, where the tab bar would be a distraction. */
const HIDDEN_ON = ["/onboarding", "/login", "/signup"];

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** Floating glass tab bar (style v2). The active tab has a tinted pill as well as colour. */
export function BottomTabs() {
  const pathname = usePathname();
  if (HIDDEN_ON.some((p) => under(pathname, p))) return null;

  return (
    <>
      {/* Keeps the end of the page clear of the floating bar. */}
      <div aria-hidden="true" className="h-[calc(100px+env(safe-area-inset-bottom))]" />
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 px-3.5 pb-[calc(12px+env(safe-area-inset-bottom))]"
      >
        <ul className="mx-auto grid h-[72px] max-w-[362px] grid-cols-4 rounded-[23px] border border-white/90 bg-white/85 px-1.5 shadow-[0_14px_42px_rgb(64_48_71/0.14)] backdrop-blur-xl">
          {TABS.map(({ label, icon: Icon, href, also = [] }) => {
            const active = href === "/" ? pathname === "/" : [href, ...also].some((p) => under(pathname, p));
            return (
              <li key={label} className="flex">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`my-2 flex flex-1 flex-col items-center justify-center gap-1 rounded-[16px] focus-visible:outline-2 focus-visible:outline-primary ${
                    active ? "bg-band text-primary-ink" : "text-[#625d68]"
                  }`}
                >
                  <Icon className="size-[22px]" />
                  <span className="font-mono text-[11px] font-bold">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
