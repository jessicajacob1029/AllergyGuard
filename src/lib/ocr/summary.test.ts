import { describe, expect, it } from "vitest";
import { hasNonLatinLetters, summarizeOcr } from "./summary";

// Line confidences below are real Tesseract.js 7 results (eng, best_int) on
// rendered test labels, 2026-10-28.
describe("summarizeOcr", () => {
  it("a clear English label: lowest line, nothing unclear", () => {
    const s = summarizeOcr([
      { text: "INGREDIENTS: Butter, common salt.", confidence: 96 },
      { text: "CONTAINS PERMITTED NATURAL COLOUR [ANNATTO]", confidence: 89 },
    ]);
    expect(s).toEqual({ confidence: 89, unclearLines: [] });
  });

  it("a bilingual label: the Hindi lines (read as nonsense) pull it below the threshold", () => {
    const s = summarizeOcr([
      { text: "HAART: TE, FT AT, LF q13eY, HI+1, THF,", confidence: 25 },
      { text: "H_THAT FTAA", confidence: 17 },
      { text: "INGREDIENTS: Wheat flour, sugar, salt, edible", confidence: 96 },
      { text: "vegetable oil.", confidence: 96 },
    ]);
    // The page average would be 58; the lowest line decides.
    expect(s.confidence).toBe(17);
    expect(s.unclearLines).toEqual(["HAART: TE, FT AT, LF q13eY, HI+1, THF,", "H_THAT FTAA"]);
  });

  it("ignores only lines with no letters and no digits (borders, rules)", () => {
    expect(summarizeOcr([{ text: "Sugar, salt", confidence: 92 }, { text: "| ——— |", confidence: 10 }]).confidence).toBe(92);
  });

  it("an E-number line still counts: a misread E322 must lower the confidence", () => {
    const s = summarizeOcr([
      { text: "Sugar, cocoa butter, emulsifier", confidence: 94 },
      { text: "(E322), 330", confidence: 41 },
    ]);
    expect(s.confidence).toBe(41);
    expect(s.unclearLines).toEqual(["(E322), 330"]);
  });

  it("a digits-only line counts too", () => {
    expect(summarizeOcr([{ text: "Sugar", confidence: 90 }, { text: "(3%)", confidence: 30 }]).confidence).toBe(30);
  });

  it("no readable line gives 0", () => {
    expect(summarizeOcr([])).toEqual({ confidence: 0, unclearLines: [] });
    expect(summarizeOcr([{ text: "  ", confidence: 90 }]).confidence).toBe(0);
  });

  it("treats a missing or odd confidence as 0, and clamps to 0–100", () => {
    expect(summarizeOcr([{ text: "Sugar", confidence: Number.NaN }]).confidence).toBe(0);
    expect(summarizeOcr([{ text: "Sugar", confidence: 140 }]).confidence).toBe(100);
  });

  it("uses a custom threshold for unclear lines", () => {
    expect(summarizeOcr([{ text: "Sugar, salt", confidence: 80 }], 85).unclearLines).toEqual(["Sugar, salt"]);
  });
});

describe("hasNonLatinLetters", () => {
  it.each(["दूध पाउडर", "Sugar, दूध", "сахар"])("%j is not (only) Latin", (t) => {
    expect(hasNonLatinLetters(t)).toBe(true);
  });
  it.each(["Sugar, crème fraîche, 3%", "", "(508 & 412)"])("%j is Latin only", (t) => {
    expect(hasNonLatinLetters(t)).toBe(false);
  });
});
