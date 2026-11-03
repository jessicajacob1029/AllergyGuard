import { describe, expect, it } from "vitest";
import {
  formatDiaryDate,
  formatDiaryDateTime,
  fromLocalInputValue,
  readReactionRows,
  toLocalInputValue,
  toReactionInput,
  validateReaction,
  type ReactionInput,
} from "./reactions";

const NOW = new Date("2026-10-29T12:00:00Z");
const SCAN_ID = "3f0c2a4e-8b1d-4c7a-9e2f-1a2b3c4d5e6f";

const valid: ReactionInput = {
  occurredAt: "2026-10-29T08:30:00.000Z",
  food: "  Snickers bar ",
  symptoms: ["swelling", "hives_rash"],
  severity: "moderate",
  treatment: "antihistamine",
  notes: "  Started 10 minutes after eating. ",
  scanId: SCAN_ID,
};

describe("validateReaction", () => {
  it("cleans a valid reaction: trims text, orders symptoms like the list", () => {
    const result = validateReaction(valid, NOW);
    expect(result).toEqual({
      ok: true,
      value: {
        occurred_at: "2026-10-29T08:30:00.000Z",
        food: "Snickers bar",
        scan_id: SCAN_ID,
        symptoms: ["hives_rash", "swelling"],
        severity: "moderate",
        treatment: "antihistamine",
        notes: "Started 10 minutes after eating.",
      },
    });
  });

  it("treats treatment, notes and scan link as optional", () => {
    const result = validateReaction({ ...valid, treatment: null, notes: "   ", scanId: null }, NOW);
    expect(result.ok && result.value).toMatchObject({ treatment: null, notes: null, scan_id: null });
  });

  it("drops repeated symptoms", () => {
    const result = validateReaction({ ...valid, symptoms: ["itching", "itching"] }, NOW);
    expect(result.ok && result.value.symptoms).toEqual(["itching"]);
  });

  it("asks for every required field in plain words", () => {
    const result = validateReaction(
      { occurredAt: "", food: "  ", symptoms: [], severity: null, treatment: null, notes: "", scanId: null },
      NOW,
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        occurredAt: "Enter the date and time it happened.",
        food: "Enter what you ate or touched.",
        symptoms: "Choose at least one symptom.",
        severity: "Choose how bad it was.",
      },
    });
  });

  it("rejects values that aren't on the lists, and a bad scan link", () => {
    const result = validateReaction(
      { ...valid, symptoms: ["sneezing"], severity: "extreme", treatment: "epipen", scanId: "../etc" },
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["scanId", "severity", "symptoms", "treatment"]);
  });

  it("limits food and notes length", () => {
    const result = validateReaction({ ...valid, food: "a".repeat(201), notes: "b".repeat(2001) }, NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.food).toMatch(/200/);
    expect(result.errors.notes).toMatch(/2000/);
  });

  it("rejects an unreadable time", () => {
    const result = validateReaction({ ...valid, occurredAt: "not a date" }, NOW);
    expect(result.ok || result.errors.occurredAt).toBe("Enter the date and time it happened.");
  });

  it("uses validateOccurredAt for future times", () => {
    const result = validateReaction({ ...valid, occurredAt: "2026-10-30T12:00:00.000Z" }, NOW);
    expect(result.ok || result.errors.occurredAt).toBe("That time is in the future.");
  });
});

describe("toReactionInput", () => {
  it("round-trips a saved row through the form", () => {
    const row = {
      id: SCAN_ID,
      occurred_at: "2026-10-29T08:30:00.000Z",
      food: "Snickers bar",
      scan_id: null,
      symptoms: ["itching" as const],
      severity: "mild" as const,
      treatment: null,
      notes: null,
    };
    const { id, ...columns } = row;
    void id;
    expect(validateReaction(toReactionInput(row), NOW)).toEqual({ ok: true, value: columns });
  });
});

describe("readReactionRows", () => {
  it("keeps good rows and skips rows with unknown values", () => {
    const good = {
      id: SCAN_ID,
      occurred_at: "2026-10-29T08:30:00+00:00",
      food: "Milk tea",
      scan_id: null,
      symptoms: ["itching", "future_symptom"],
      severity: "severe",
      treatment: "future_treatment",
      notes: null,
    };
    const rows = readReactionRows([good, { ...good, id: "nope" }, { ...good, severity: "extreme" }]);
    expect(rows).toEqual([{ ...good, symptoms: ["itching"], treatment: null }]);
  });
});

describe("local date and time input", () => {
  it("converts both ways in the phone's time zone", () => {
    const date = new Date(2026, 9, 29, 7, 5); // local time
    expect(toLocalInputValue(date)).toBe("2026-10-29T07:05");
    expect(fromLocalInputValue("2026-10-29T07:05")).toBe(date.toISOString());
  });

  it("gives an empty string for empty or broken input", () => {
    expect(fromLocalInputValue("")).toBe("");
    expect(fromLocalInputValue("29/10/2026 07:05")).toBe("");
    expect(fromLocalInputValue("2026-13-45T99:99")).toBe("");
  });
});

describe("formatting", () => {
  it("formats the card date in the user's zone, not the server's", () => {
    // 20:00 UTC on 28 Oct is already 29 Oct in India.
    expect(formatDiaryDate("2026-10-28T20:00:00Z", "Asia/Kolkata")).toBe("29 OCT 2026");
    expect(formatDiaryDate("2026-10-28T20:00:00Z", "UTC")).toBe("28 OCT 2026");
  });

  it("formats the full date and time", () => {
    expect(formatDiaryDateTime("2026-10-28T20:00:00Z", "Asia/Kolkata")).toBe("Thu, 29 Oct 2026, 01:30");
  });
});
