// Checks the text from a label photo or pasted text (Phase 5). Pure: no UI,
// no network. All matching is checkAllergens() (CLAUDE.md "Verdicts"); this
// only checks the input and passes what the source says about its reliability.
import { checkAllergens, type CheckAllergen, type CheckOptions, type CheckResult } from "@/lib/allergen/check";
import { MAX_SCAN_TEXT } from "@/lib/products/scan-record";
import { hasNonLatinLetters } from "./summary";

export type LabelCheckInput =
  | {
      source: "photo";
      /** The OCR text after tidying and joinOcrLines(), maybe edited by the user. */
      text: string;
      /** What Tesseract read, before any changes. */
      ocrText: string;
      /** summarizeOcr().confidence for the photo (0–100). */
      ocrConfidence: number;
      /** The user ticked "I've compared this text with the label and it matches." */
      textChecked: boolean;
    }
  | {
      /** Text the user pasted (e.g. copied from the Photos app). No OCR confidence. */
      source: "paste";
      text: string;
    };

const BROKEN = { ok: false as const, error: "Something went wrong. Try again." };

const sameKeys = (value: object, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((k) => k in value);

/**
 * Validates what the browser sent. Only strings and a number are accepted,
 * with exactly the fields of one source: never an image or file (a photo
 * stays on the phone).
 */
export function parseLabelCheckInput(value: unknown): { ok: true; input: LabelCheckInput } | { ok: false; error: string } {
  if (typeof value !== "object" || value === null) return BROKEN;
  const v = value as Record<string, unknown>;
  let input: LabelCheckInput;
  if (v.source === "photo" && sameKeys(v, ["source", "text", "ocrText", "ocrConfidence", "textChecked"])) {
    const { text, ocrText, ocrConfidence, textChecked } = v;
    if (typeof text !== "string" || typeof ocrText !== "string" || typeof textChecked !== "boolean") return BROKEN;
    if (typeof ocrConfidence !== "number" || !Number.isFinite(ocrConfidence) || ocrConfidence < 0 || ocrConfidence > 100) {
      return BROKEN;
    }
    input = { source: "photo", text, ocrText, ocrConfidence, textChecked };
  } else if (v.source === "paste" && sameKeys(v, ["source", "text"])) {
    if (typeof v.text !== "string") return BROKEN;
    input = { source: "paste", text: v.text };
  } else {
    return BROKEN;
  }
  if (input.text.trim() === "") {
    return {
      ok: false,
      error:
        input.source === "paste"
          ? "There's no text to check. Paste the ingredients first."
          : "There's no text to check. Type the ingredients or retake the photo.",
    };
  }
  if (input.text.length > MAX_SCAN_TEXT || (input.source === "photo" && input.ocrText.length > MAX_SCAN_TEXT)) {
    return { ok: false, error: "This text is too long. Keep only the ingredients list." };
  }
  return { ok: true, input };
}

// "Ingredients", "Contains" or the Hindi "सामग्री" (ingredients), any case.
// \b doesn't work for Devanagari, so that word is matched on its own.
const INGREDIENTS_HEADING = /\b(?:ingredients|contains)\b|सामग्री/iu;

/** A label photo shows an ingredients list only if it has one of its headings (decided 2026-11-04). */
export function hasIngredientsHeading(text: string): boolean {
  return INGREDIENTS_HEADING.test(text);
}

/**
 * Pasted text too short to be an ingredients list: fewer than 2 items
 * (separated by commas, semicolons or line breaks) or fewer than 10 letters
 * (decided 2026-11-04). "1" or "Sugar" alone is never Safe.
 */
export function isTooShortForIngredients(text: string): boolean {
  const items = text.split(/[,;\n]/).filter((part) => /\p{L}/u.test(part));
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  return items.length < 2 || letters < 10;
}

/** Why the text counts as incomplete, if it does. The first reason found is the one shown. */
function incompleteReason(input: LabelCheckInput): CheckOptions["incomplete"] {
  if (input.source === "photo" && !hasIngredientsHeading(input.text)) return "no_ingredients_list";
  // No letters at all is already "no ingredient list" (missing_text) in checkAllergens().
  if (input.source === "paste" && /\p{L}/u.test(input.text) && isTooShortForIngredients(input.text)) return "too_short";
  // Text in another script (e.g. Hindi) can't be read.
  return hasNonLatinLetters(input.text);
}

/**
 * The verdict for a label photo or pasted text.
 * - Photo: its confidence counts, even after the user edits the text: editing
 *   alone can't turn a doubtful read into Safe (decided 2026-10-28).
 * - Photo the user ticked as checked ("I've compared this text with the label
 *   and it matches", decided 2026-11-03): judged on the text alone, like
 *   pasted text. Only the low-confidence reason goes: a match is still Unsafe,
 *   and may-contain, free-from claims and incomplete text still give Caution.
 * - Paste: no OCR confidence, so it is judged on the text alone (decided
 *   2026-10-28); the verdict screen's "always read the label" line still applies.
 * - Incomplete (Caution, never Safe), and the tick never overrides it: a photo
 *   with no ingredients heading, pasted text that's too short, or text in
 *   another script such as Hindi.
 */
export function checkLabelText(input: LabelCheckInput, allergens: readonly CheckAllergen[]): CheckResult {
  const incomplete = incompleteReason(input);
  return input.source === "photo" && !input.textChecked
    ? checkAllergens(input.text, allergens, { ocrConfidence: input.ocrConfidence, incomplete })
    : checkAllergens(input.text, allergens, { incomplete });
}
