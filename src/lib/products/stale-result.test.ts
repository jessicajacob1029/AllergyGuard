import { describe, expect, it } from "vitest";
import { checkAllergens, type CheckAllergen } from "@/lib/allergen/check";
import { canBeOutOfDate, canRecheck, currentVerdict, isOutOfDate, matchesVerdictFilter, recheckScan, type SavedScanInputs } from "./stale-result";

const KIWI: CheckAllergen[] = [{ kind: "custom", name: "kiwi" }];
const KIWI_MILK: CheckAllergen[] = [...KIWI, { kind: "predefined", code: "milk" }];

// Jessica's real Amul Butter scan from 28 October.
const amul: SavedScanInputs = {
  input: "manual",
  barcode: "8901262010016",
  product_found: true,
  ingredients_text: "Butter, common salt. CONTAINS PERMITTED NATURAL COLOUR [ANNATTO]",
  declared_allergens: ["milk"],
  declared_traces: [],
  data_notes: [],
};

describe("isOutOfDate", () => {
  it("is true only when an allergen was added after the check", () => {
    expect(isOutOfDate("2026-10-28T10:00:00Z", "2026-11-03T07:28:05Z")).toBe(true);
    expect(isOutOfDate("2026-11-03T08:00:00Z", "2026-11-03T07:28:05Z")).toBe(false);
    expect(isOutOfDate("2026-10-28T10:00:00Z", null)).toBe(false);
    expect(isOutOfDate("not a date", "2026-11-03T07:28:05Z")).toBe(false);
  });
});

describe("recheckScan", () => {
  it("the saved Safe Amul Butter is Unsafe with Milk added: no new lookup needed", () => {
    expect(recheckScan(amul, KIWI).verdict).toBe("safe");
    const now = recheckScan(amul, KIWI_MILK);
    expect(now.verdict).toBe("unsafe");
    expect(now.matches.some((m) => m.allergen === "Milk")).toBe(true);
    expect(now.rawText).toBe(amul.ingredients_text);
  });

  it("gives exactly what a fresh scan of the same data would (same checkAllergens() call)", () => {
    const withNotes: SavedScanInputs = { ...amul, data_notes: ["Some of this product's allergen information isn't in English."] };
    expect(recheckScan(withNotes, KIWI_MILK)).toEqual(
      checkAllergens(withNotes.ingredients_text, KIWI_MILK, {
        incomplete: true,
        declared: { contains: ["milk"], mayContain: [] },
      }),
    );
  });

  it("never turns missing data into Safe", () => {
    expect(recheckScan({ ...amul, ingredients_text: null, declared_allergens: [] }, KIWI_MILK).verdict).toBe("caution");
  });
});

describe("canRecheck", () => {
  it("only barcode scans of a product Open Food Facts had", () => {
    expect(canRecheck(amul)).toBe(true);
    expect(canRecheck({ ...amul, input: "camera" })).toBe(true);
    expect(canRecheck({ ...amul, product_found: false })).toBe(false);
    expect(canRecheck({ ...amul, input: "photo", barcode: null })).toBe(false);
    expect(canRecheck({ ...amul, input: "paste", barcode: null })).toBe(false);
  });
});

describe("currentVerdict (what lists and the result page show today)", () => {
  const saved = { ...amul, verdict: "safe" as const, created_at: "2026-10-28T10:00:00Z" };
  const MILK_ADDED = "2026-11-03T07:28:05Z";

  it("up to date: the saved verdict", () => {
    expect(currentVerdict(saved, "2026-10-01T00:00:00Z", KIWI)).toEqual({ shown: "safe", saved: "safe", outOfDate: false });
  });

  it("an allergen added since: re-checked from the saved ingredients, never the stale Safe", () => {
    expect(currentVerdict(saved, MILK_ADDED, KIWI_MILK)).toEqual({ shown: "unsafe", saved: "safe", outOfDate: true });
  });

  it("a label photo or pasted text that's out of date: Re-check needed", () => {
    const photo = { ...saved, input: "photo", barcode: null, product_found: false };
    expect(currentVerdict(photo, MILK_ADDED, KIWI_MILK)).toEqual({ shown: "recheck_needed", saved: "safe", outOfDate: true });
  });

  it("a barcode Open Food Facts didn't have stays as saved (Caution whatever the allergies)", () => {
    const missing = { ...saved, product_found: false, ingredients_text: null, verdict: "caution" as const };
    expect(canBeOutOfDate(missing)).toBe(false);
    expect(currentVerdict(missing, MILK_ADDED, KIWI_MILK)).toEqual({ shown: "caution", saved: "caution", outOfDate: false });
  });
});

describe("matchesVerdictFilter", () => {
  it("filters on the current verdict; Re-check needed only under All and Caution", () => {
    expect(matchesVerdictFilter("unsafe", "unsafe")).toBe(true);
    expect(matchesVerdictFilter("unsafe", "safe")).toBe(false);
    expect(matchesVerdictFilter("recheck_needed", null)).toBe(true);
    expect(matchesVerdictFilter("recheck_needed", "caution")).toBe(true);
    expect(matchesVerdictFilter("recheck_needed", "safe")).toBe(false);
    expect(matchesVerdictFilter("recheck_needed", "unsafe")).toBe(false);
  });
});
