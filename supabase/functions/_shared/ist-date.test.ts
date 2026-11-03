import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isIsoDate, istDate } from "./ist-date.ts";

describe("istDate", () => {
  it("is still the same IST day one second before midnight IST (18:29:59 UTC)", () => {
    expect(istDate(new Date("2026-11-01T18:29:59Z"))).toBe("2026-11-01");
  });

  it("turns to the next IST day at midnight IST (18:30:00 UTC), while UTC is still on the old day", () => {
    expect(istDate(new Date("2026-11-01T18:30:00Z"))).toBe("2026-11-02");
  });

  it("is the next IST day at 02:00 IST, when UTC is still on the previous day", () => {
    // 2026-11-07 02:00 IST is 2026-11-06 20:30 UTC.
    expect(istDate(new Date("2026-11-06T20:30:00Z"))).toBe("2026-11-07");
  });

  it("gives the run date for the daily job at 08:00 IST (02:30 UTC)", () => {
    expect(istDate(new Date("2026-11-01T02:30:00Z"))).toBe("2026-11-01");
  });

  it("handles month and year ends", () => {
    expect(istDate(new Date("2026-12-31T18:30:00Z"))).toBe("2027-01-01");
    expect(istDate(new Date("2028-02-28T18:30:00Z"))).toBe("2028-02-29");
  });
});

describe("daysBetween", () => {
  it("counts whole calendar days", () => {
    expect(daysBetween("2026-11-01", "2026-11-08")).toBe(7);
    expect(daysBetween("2026-11-01", "2026-11-01")).toBe(0);
    expect(daysBetween("2026-11-01", "2026-10-31")).toBe(-1);
    expect(daysBetween("2026-12-25", "2027-01-24")).toBe(30);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("an expiry date counts as 'today' all day in IST, including just after midnight IST", () => {
    const justAfterMidnight = istDate(new Date("2026-11-07T18:31:00Z")); // 00:01 IST on 8 Nov
    expect(daysBetween(justAfterMidnight, "2026-11-08")).toBe(0);
    const justBeforeMidnight = istDate(new Date("2026-11-08T18:29:00Z")); // 23:59 IST on 8 Nov
    expect(daysBetween(justBeforeMidnight, "2026-11-08")).toBe(0);
  });

  it("rejects anything that isn't a real YYYY-MM-DD date", () => {
    expect(() => daysBetween("2026-11-1", "2026-11-08")).toThrow();
    expect(() => daysBetween("2026-02-30", "2026-03-01")).toThrow();
  });
});

describe("isIsoDate / addDays", () => {
  it("accepts real dates only", () => {
    expect(isIsoDate("2026-11-01")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("01-11-2026")).toBe(false);
  });

  it("adds days across month ends", () => {
    expect(addDays("2026-11-25", 7)).toBe("2026-12-02");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
  });
});
