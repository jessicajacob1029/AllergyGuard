import { describe, expect, it } from "vitest";
import { formatCheckedAt } from "./format";

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
