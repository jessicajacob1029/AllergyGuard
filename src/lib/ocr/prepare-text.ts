// Tidies OCR text before the user sees it in the editable box (Phase 5).
// Pure. This is NOT matching: the user can change the result, and
// checkAllergens() still decides the verdict.
import { joinOcrLines } from "./ocr-text";

/**
 * Fixes "|" characters Tesseract invents (decided 2026-10-28):
 * - followed by a letter, it is a misread "l" or "I": "Mi|k" → "Milk",
 *   "|ecithin" → "lecithin";
 * - otherwise it is a border or column edge and is removed: "salt, |",
 *   "(451(i).|", and "gluten|" (a letter only before it: turning it into
 *   "l" would make "glutenl" and hide the allergen, which is weaker than the
 *   raw text).
 * Spaces left behind by a removed "|" are tidied; line breaks are kept.
 */
export function tidyOcrText(text: string): string {
  return text
    .split(/(\r?\n)/)
    .map((part) => {
      if (!part.includes("|")) return part;
      let out = "";
      for (let i = 0; i < part.length; i++) {
        const ch = part[i];
        if (ch !== "|") {
          out += ch;
          continue;
        }
        // Look past a run of "|" ("Mo||uscs" → "Molluscs").
        let next = i + 1;
        while (part[next] === "|") next++;
        if (/\p{L}/u.test(part[next] ?? "")) out += "l";
      }
      // Removing "a, | b" leaves "a,  b"; removing "b. |" leaves "b. ".
      return out.replace(/ {2,}/g, " ").trimEnd();
    })
    .join("");
}

/** What the review box shows for OCR text: tidied, then wrapped lines rejoined. */
export function prepareOcrText(raw: string): string {
  return joinOcrLines(tidyOcrText(raw));
}
