// Mapping between a check (barcode or label photo) and a row of public.scans. Pure.
import type { CheckResult, Verdict } from "@/lib/allergen/check";
import type { ProductLookup } from "./open-food-facts";

/** Must match the public.scan_verdict enum (a test checks this). */
export const SCAN_VERDICTS = ["safe", "caution", "unsafe"] as const satisfies readonly Verdict[];

/** How a barcode was entered. */
export type ScanInput = "camera" | "manual";
/** Every kind of scan row: a barcode, or a label photo (Phase 5). */
export type ScanSource = ScanInput | "photo";

/** Column limit for ingredient and OCR text (same as the migration). */
export const MAX_SCAN_TEXT = 20000;

export type ScanInsert = {
  profile_id: string;
  /** Null for a label photo. */
  barcode: string | null;
  input: ScanSource;
  product_found: boolean;
  product_name: string | null;
  brands: string | null;
  ingredients_text: string | null;
  declared_allergens: string[];
  declared_traces: string[];
  data_notes: string[];
  verdict: Verdict;
  result: CheckResult;
  off_last_modified: string | null;
  /** Label photos only: what Tesseract read, before any edits. */
  ocr_text: string | null;
  /** Label photos only: 0–100, the lowest line confidence. */
  ocr_confidence: number | null;
};

export type ScanRow = ScanInsert & { id: string; created_at: string };

const clip = (value: string | null, max: number) => (value === null ? null : value.slice(0, max));

export function toScanInsert(args: {
  profileId: string;
  barcode: string;
  input: ScanInput;
  lookup: ProductLookup;
  result: CheckResult;
}): ScanInsert {
  const { profileId, barcode, input, lookup, result } = args;
  const found = lookup.found ? lookup : null;
  return {
    profile_id: profileId,
    barcode,
    input,
    product_found: lookup.found,
    product_name: clip(found?.name ?? null, 500),
    brands: clip(found?.brands ?? null, 500),
    ingredients_text: clip(found?.ingredientsText ?? null, MAX_SCAN_TEXT),
    declared_allergens: found?.declared.contains ?? [],
    declared_traces: found?.declared.mayContain ?? [],
    data_notes: found?.notes ?? [],
    verdict: result.verdict,
    result,
    off_last_modified: found?.lastModified ?? null,
    ocr_text: null,
    ocr_confidence: null,
  };
}

/**
 * A label photo check. Only text and a number: the photo itself is never
 * stored or sent anywhere. `text` is what was checked (the user may have
 * edited it); it must already fit MAX_SCAN_TEXT (the Server Action rejects
 * longer text rather than checking one thing and storing another).
 */
export function toLabelScanInsert(args: {
  profileId: string;
  text: string;
  ocrText: string;
  ocrConfidence: number;
  result: CheckResult;
}): ScanInsert {
  const { profileId, text, ocrText, ocrConfidence, result } = args;
  return {
    profile_id: profileId,
    barcode: null,
    input: "photo",
    product_found: false,
    product_name: null,
    brands: null,
    ingredients_text: text,
    declared_allergens: [],
    declared_traces: [],
    data_notes: [],
    verdict: result.verdict,
    result,
    off_last_modified: null,
    ocr_text: ocrText,
    ocr_confidence: ocrConfidence,
  };
}

/**
 * Reads the stored result back. Returns null if the JSON doesn't look like a
 * CheckResult (e.g. written by an older version), so the page can say so
 * instead of showing a wrong verdict.
 */
export function readStoredResult(value: unknown): CheckResult | null {
  if (typeof value !== "object" || value === null) return null;
  const r = value as Partial<CheckResult>;
  if (!SCAN_VERDICTS.includes(r.verdict as Verdict)) return null;
  if (typeof r.explanation !== "string" || typeof r.rawText !== "string") return null;
  if (!Array.isArray(r.matches) || !Array.isArray(r.warnings)) return null;
  return r as CheckResult;
}
