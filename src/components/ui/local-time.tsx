"use client";

import { useSyncExternalStore } from "react";
import { formatDiaryDate, formatDiaryDateTime } from "@/lib/diary/reactions";
import {
  formatCheckedAt,
  formatDayOfMonth,
  formatListTime,
  formatShortMonth,
  formatWeekdayDate,
} from "@/lib/time/format";

const subscribeNever = () => () => {};

/** False during server rendering and hydration, true after: browser-only values are safe to show. */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

const FORMATS = {
  checkedAt: formatCheckedAt,
  date: formatDiaryDate,
  dateTime: formatDiaryDateTime,
  listTime: formatListTime,
  weekdayDate: formatWeekdayDate,
  dayOfMonth: formatDayOfMonth,
  shortMonth: formatShortMonth,
} as const;

/**
 * A time shown in the phone's own time zone. The server runs in UTC, so it
 * renders a blank space and the browser fills in the text (in India a scan at
 * 23:37 would otherwise show as 18:07, and a reaction at 01:30 on the day before).
 */
export function LocalTime({ iso, format }: { iso: string; format: keyof typeof FORMATS }) {
  const hydrated = useHydrated();
  return <time dateTime={iso}>{hydrated ? FORMATS[format](iso) : " "}</time>;
}
