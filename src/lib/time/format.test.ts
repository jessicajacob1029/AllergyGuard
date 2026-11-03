import { describe, expect, it } from "vitest";
import { formatCheckedAt, formatDayOfMonth, formatListTime, formatShortMonth, formatWeekdayDate } from "./format";

describe("formatCheckedAt", () => {
  it("shows the time in the given zone, not the server's", () => {
    // 18:07 UTC is 23:37 in India.
    expect(formatCheckedAt("2026-10-28T18:07:00Z", "Asia/Kolkata")).toBe("28 Oct 2026, 23:37");
    expect(formatCheckedAt("2026-10-28T18:07:00Z", "UTC")).toBe("28 Oct 2026, 18:07");
  });

  it("moves to the next day when the zone does", () => {
    expect(formatCheckedAt("2026-10-28T20:00:00Z", "Asia/Kolkata")).toBe("29 Oct 2026, 01:30");
  });
});

describe("list and tile formats", () => {
  // 20:00 UTC on 28 Oct is 01:30 on Thursday 29 Oct in India.
  const iso = "2026-10-28T20:00:00Z";

  it("formats a scan row time in the given zone", () => {
    expect(formatListTime(iso, "Asia/Kolkata")).toBe("29 Oct · 01:30");
    expect(formatListTime(iso, "UTC")).toBe("28 Oct · 20:00");
  });

  it("formats the weekday line on home", () => {
    expect(formatWeekdayDate(iso, "Asia/Kolkata")).toBe("Thursday · 29 Oct");
  });

  it("splits the diary date tile into day and month", () => {
    expect(formatDayOfMonth("2026-08-07T09:00:00Z", "Asia/Kolkata")).toBe("07");
    expect(formatShortMonth(iso, "Asia/Kolkata")).toBe("OCT");
    expect(formatShortMonth("2026-09-03T09:00:00Z", "UTC")).toBe("SEP");
  });
});
