"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { DiaryIcon, HomeIcon, PersonIcon, ScanIcon } from "./icons";

type Tab = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Null while the feature isn't built: shown as "Soon", not a link. */
  href: string | null;
};

// Diary arrives in Phase 6: flip its `href` when it ships.
export const TABS: readonly Tab[] = [
  { label: "Home", icon: HomeIcon, href: "/" },
  { label: "Scan", icon: ScanIcon, href: "/scan" },
  { label: "Diary", icon: DiaryIcon, href: null },
  { label: "Profile", icon: PersonIcon, href: "/profile" },
];

/** Screens with their own flow, where the tab bar would be a distraction. */
const HIDDEN_ON = ["/onboarding", "/login", "/signup"];

export function BottomTabs() {
  const pathname = usePathname();
  if (HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  return (
    <>
      {/* Keeps the end of the page clear of the fixed bar. */}
      <div aria-hidden="true" className="h-[calc(76px+env(safe-area-inset-bottom))]" />
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="mx-auto grid h-[68px] max-w-sm grid-cols-4">
          {TABS.map(({ label, icon: Icon, href }) => {
            const active = href !== null && (href === "/" ? pathname === "/" : pathname.startsWith(href));
            const content = (
              <>
                <span
                  className={`flex h-8 w-14 items-center justify-center rounded-full ${active ? "bg-band" : ""}`}
                >
                  <Icon className="size-6" />
                </span>
                <span className="text-xs font-extrabold">{label}</span>
              </>
            );
            return (
              <li key={label} className="flex">
                {href ? (
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`flex flex-1 flex-col items-center justify-center gap-0.5 ${
                      active ? "text-primary-ink" : "text-muted"
                    }`}
                  >
                    {content}
                  </Link>
                ) : (
                  <span className="flex flex-1 flex-col items-center justify-center gap-0.5 text-muted">
                    {/* "Soon" sits on the icon's corner, so the label keeps its own line at any width. */}
                    <span className="relative flex h-8 w-14 items-center justify-center">
                      <Icon className="size-6" />
                      <span
                        aria-hidden="true"
                        className="absolute -right-1.5 -top-1 rounded-full border border-line bg-page px-1 text-[10px] font-extrabold leading-tight"
                      >
                        Soon
                      </span>
                    </span>
                    <span className="whitespace-nowrap text-xs font-extrabold">
                      {label}
                      <span className="sr-only">, coming soon</span>
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
