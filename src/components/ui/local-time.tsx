"use client";

import { useSyncExternalStore } from "react";
import { formatDiaryDate, formatDiaryDateTime } from "@/lib/diary/reactions";

const subscribeNever = () => () => {};

/** False during server rendering and hydration, true after: browser-only values are safe to show. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

/**
 * A time shown in the phone's own time zone. The server runs in UTC, so it
 * renders a blank space and the browser fills in the text (in India a reaction
 * at 01:30 would otherwise show as the previous day).
 */
export function LocalTime({ iso, format }: { iso: string; format: "date" | "dateTime" }) {
  const hydrated = useHydrated();
  const text = hydrated ? (format === "date" ? formatDiaryDate(iso) : formatDiaryDateTime(iso)) : "";
  return <time dateTime={iso}>{text || " "}</time>;
}
