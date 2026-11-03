"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hidesTabs, isTabActive, TABS } from "./bottom-tabs";

/** Home · Scan · Diary · Profile in the header, from 900px wide (phones use the bottom bar). */
export function DesktopNav() {
  const pathname = usePathname();
  if (hidesTabs(pathname)) return null;
  return (
    <nav aria-label="Main" className="hidden desk:block">
      <ul className="flex items-center gap-1 rounded-[16px] border border-white/80 bg-white/60 p-1">
        {TABS.map((tab) => {
          const active = isTabActive(pathname, tab);
          const { label, icon: Icon, href } = tab;
          return (
            <li key={label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-[12px] px-4 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-primary ${
                  active ? "bg-band text-primary-ink" : "text-[#4f4955] hover:bg-white/80"
                }`}
              >
                <Icon className="size-[18px]" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
