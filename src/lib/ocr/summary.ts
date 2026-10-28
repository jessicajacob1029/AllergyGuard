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

// Lines with fewer letters than this ("(3%)", "·") don't count: their
// confidence says little and they can't hold an ingredient name.
const MIN_LETTERS = 3;

const letterCount = (s: string) => s.match(/\p{L}/gu)?.length ?? 0;

export function summarizeOcr(lines: readonly OcrLine[], min = DEFAULT_MIN_OCR_CONFIDENCE): OcrSummary {
  const counted = lines
    .map((l) => ({ text: l.text.trim(), confidence: Number.isFinite(l.confidence) ? l.confidence : 0 }))
    .filter((l) => letterCount(l.text) >= MIN_LETTERS);
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
