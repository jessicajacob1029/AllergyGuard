// Checks the text from a label photo (Phase 5). Pure: no UI, no network.
// All matching is checkAllergens() (CLAUDE.md "Verdicts"); this only checks
// the input and passes what the photo says about its own reliability.
import { checkAllergens, type CheckAllergen, type CheckResult } from "@/lib/allergen/check";
import { MAX_SCAN_TEXT } from "@/lib/products/scan-record";
import { hasNonLatinLetters } from "./summary";

export type LabelCheckInput = {
  /** The text to check: the OCR text after joinOcrLines(), maybe edited by the user. */
  text: string;
  /** What Tesseract read, before any changes. */
  ocrText: string;
  /** summarizeOcr().confidence for the photo (0–100). */
  ocrConfidence: number;
};

/**
 * Validates what the browser sent. Only two strings and a number are
 * accepted: never an image or file (the photo stays on the phone).
 */
export function parseLabelCheckInput(value: unknown): { ok: true; input: LabelCheckInput } | { ok: false; error: string } {
  if (typeof value !== "object" || value === null) return { ok: false, error: "Something went wrong. Try again." };
  const { text, ocrText, ocrConfidence, ...rest } = value as Record<string, unknown>;
  if (Object.keys(rest).length > 0 || typeof text !== "string" || typeof ocrText !== "string") {
    return { ok: false, error: "Something went wrong. Try again." };
  }
  if (typeof ocrConfidence !== "number" || !Number.isFinite(ocrConfidence) || ocrConfidence < 0 || ocrConfidence > 100) {
    return { ok: false, error: "Something went wrong. Try again." };
  }
  if (text.trim() === "") return { ok: false, error: "There's no text to check. Type the ingredients or retake the photo." };
  if (text.length > MAX_SCAN_TEXT || ocrText.length > MAX_SCAN_TEXT) {
    return { ok: false, error: "This text is too long. Keep only the ingredients list." };
  }
  return { ok: true, input: { text, ocrText, ocrConfidence } };
}

/**
 * The verdict for a label photo. The photo's confidence always counts, even
 * after the user edits the text: editing can't turn a doubtful read into
 * Safe (decided 2026-10-28). Text in another script (e.g. Hindi typed in)
 * can't be read, so it counts as incomplete.
 */
export function checkLabelText(input: LabelCheckInput, allergens: readonly CheckAllergen[]): CheckResult {
  return checkAllergens(input.text, allergens, {
    ocrConfidence: input.ocrConfidence,
    incomplete: hasNonLatinLetters(input.text),
  });
}
