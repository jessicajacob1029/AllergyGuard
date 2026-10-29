import { describe, expect, it } from "vitest";
import { EARLIEST_OCCURRED_AT, FUTURE_GRACE_MS, validateOccurredAt } from "./occurred-at";

const NOW = new Date("2026-10-29T12:00:00Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);
const MIN = 60 * 1000;

describe("validateOccurredAt", () => {
  it("allows now and the recent past", () => {
    expect(validateOccurredAt(NOW, NOW)).toBeNull();
    expect(validateOccurredAt(at(-5 * MIN), NOW)).toBeNull();
    expect(validateOccurredAt(at(-400 * 24 * 60 * MIN), NOW)).toBeNull();
  });

  it("allows up to 10 minutes ahead, for phone clock drift", () => {
    expect(FUTURE_GRACE_MS).toBe(10 * MIN);
    expect(validateOccurredAt(at(9 * MIN), NOW)).toBeNull();
    expect(validateOccurredAt(at(10 * MIN), NOW)).toBeNull();
  });

  it("rejects anything later than 10 minutes ahead", () => {
    expect(validateOccurredAt(at(10 * MIN + 1000), NOW)).toBe("That time is in the future.");
    expect(validateOccurredAt(at(24 * 60 * MIN), NOW)).toBe("That time is in the future.");
  });

  it("allows old dates back to 1900", () => {
    expect(validateOccurredAt(EARLIEST_OCCURRED_AT, NOW)).toBeNull();
    expect(validateOccurredAt(new Date("1950-06-15T08:00:00Z"), NOW)).toBeNull();
  });

  it("rejects dates before 1900 with a message", () => {
    expect(validateOccurredAt(new Date("1899-12-31T23:59:59Z"), NOW)).toBe("Please enter a date from 1900 onwards.");
  });
});
