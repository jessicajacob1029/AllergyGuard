// What a label photo's OCR result says about how far to trust it (Phase 5).
// Pure: no UI, no network.
import { DEFAULT_MIN_OCR_CONFIDENCE } from "@/lib/allergen/check";

export type OcrLine = { text: string; confidence: number };

export type OcrSummary = {
  /**
   * The LOWEST line confidence (0–100), passed to checkAllergens() as
   * ocrConfidence. Not the page average: one unreadable line (Hindi read with
   * the English model, a smudge) can hide an allergen, and an average lets
   * good lines cover for it. 0 when no line has text.
   */
  confidence: number;
  /** Lines below the threshold, for the review screen to point at. */
  unclearLines: string[];
};

// Only lines with no letters and no digits are left out (borders, rules,
// stray symbols: "|", "———"). A line of E-numbers still counts: a misread
// "E322" (soy lecithin) must pull the confidence down (decided 2026-10-28).
const hasLetterOrDigit = (s: string) => /[\p{L}\p{N}]/u.test(s);

export function summarizeOcr(lines: readonly OcrLine[], min = DEFAULT_MIN_OCR_CONFIDENCE): OcrSummary {
  const counted = lines
    .map((l) => ({ text: l.text.trim(), confidence: Number.isFinite(l.confidence) ? l.confidence : 0 }))
    .filter((l) => hasLetterOrDigit(l.text));
  if (counted.length === 0) return { confidence: 0, unclearLines: [] };
  const confidence = Math.round(Math.min(...counted.map((l) => l.confidence)));
  return {
    confidence: Math.max(0, Math.min(100, confidence)),
    unclearLines: counted.filter((l) => l.confidence < min).map((l) => l.text),
  };
}

/**
 * True when the text has letters from a script other than Latin, e.g. Hindi
 * typed into the box. AllergyGuard only reads English, so such text is
 * treated as incomplete (Caution, never Safe).
 */
export function hasNonLatinLetters(text: string): boolean {
  return /(?!\p{Script=Latin})\p{L}/u.test(text);
}
