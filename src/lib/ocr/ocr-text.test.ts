import { describe, expect, it } from "vitest";
import { checkAllergens, type CheckAllergen, type CheckOptions, type CheckResult, type Verdict } from "@/lib/allergen/check";
import type { AllergenCode } from "@/lib/allergen/codes";
import { parseProduct } from "@/lib/products/open-food-facts";
import offProducts from "./__fixtures__/off-products.json";
import unsafeCheckCalls from "./__fixtures__/unsafe-check-calls.json";
import { joinOcrLines } from "./ocr-text";

const p = (code: AllergenCode): CheckAllergen => ({ kind: "predefined", code });

const STRENGTH: Record<Verdict, number> = { safe: 0, caution: 1, unsafe: 2 };

/** Allergens found as real ingredients ("contains"), not as may-contain. */
function containsAllergens(r: CheckResult): string[] {
  return [...new Set(r.matches.filter((m) => m.kind === "contains").map((m) => m.allergen))].sort();
}

/** Same check as before joining must be at least as strong, with the same allergens found. */
function expectNotWeaker(text: string | null, allergens: CheckAllergen[], options: CheckOptions = {}) {
  const before = checkAllergens(text, allergens, options);
  const after = checkAllergens(text === null ? null : joinOcrLines(text), allergens, options);
  expect(STRENGTH[after.verdict], `${JSON.stringify(text)}: ${before.verdict} → ${after.verdict}`).toBeGreaterThanOrEqual(
    STRENGTH[before.verdict],
  );
  expect(containsAllergens(after)).toEqual(expect.arrayContaining(containsAllergens(before)));
}

describe("joinOcrLines: when to join", () => {
  it.each([
    ["ends with a comma", "Sugar,\nmilk solids", "Sugar, milk solids"],
    ["ends with a comma and OCR's trailing space", "Sugar, \nmilk solids", "Sugar, milk solids"],
    ["several wrapped lines", "Ingredients: wheat flour,\nsugar,\nsalt", "Ingredients: wheat flour, sugar, salt"],
    ["repairs a word split by a hyphen", "Wheat glu-\nten, salt", "Wheat gluten, salt"],
    ["ends with an open bracket", "Emulsifier (\nsoy lecithin), salt", "Emulsifier (soy lecithin), salt"],
    ["ends with an open square bracket", "Colour [\nannatto]", "Colour [annatto]"],
    ["next line starts lowercase", "May contain traces of\npeanuts.", "May contain traces of peanuts."],
    ["Windows line breaks (Open Food Facts)", "Sugar,\r\nmilk solids", "Sugar, milk solids"],
    ["keeps the hyphen of a split “-free” claim", "Milk-\nfree chocolate", "Milk-free chocolate"],
  ])("%s", (_name, input, expected) => {
    expect(joinOcrLines(input)).toBe(expected);
  });
});

describe("joinOcrLines: when to keep the line break", () => {
  it.each([
    ["next line starts uppercase", "May contain traces of peanuts\nMilk solids, sugar"],
    // OCR often reads a full stop as a comma: a comma joins only a lowercase next line.
    ["a comma, then an uppercase line", "May contain peanuts,\nMilk solids, sugar"],
    ["a comma, then an uppercase ingredient", "Sugar,\nMilk solids"],
    ["a sentence ends", "Contains milk.\nStore in a cool place"],
    ["a blank line between paragraphs", "Ingredients: sugar, salt.\n\nbest before: see pack"],
    ["a closed bracket, then a new section", "Humectant (451(i))\r\nTaste maker: Hydrolyzed peanut protein"],
    ["text with no line breaks", "Sugar, palm oil, hazelnuts"],
    ["empty text", ""],
  ])("%s", (_name, input) => {
    expect(joinOcrLines(input)).toBe(input);
  });

  it("is stable: joining twice gives the same text as joining once", () => {
    const samples = [
      "Sugar,\nmilk solids\nMay contain traces of\npeanuts",
      "Wheat glu-\nten, salt.\n\nStore cool",
      "May contain nuts\nmilk, sugar",
    ];
    for (const s of samples) expect(joinOcrLines(joinOcrLines(s))).toBe(joinOcrLines(s));
  });
});

describe("joinOcrLines: verdicts after joining", () => {
  it("“May contain traces of peanuts⏎Milk solids, sugar” stays Unsafe for milk", () => {
    const r = checkAllergens(joinOcrLines("May contain traces of peanuts\nMilk solids, sugar"), [p("milk")]);
    expect(r.verdict).toBe("unsafe");
    expect(containsAllergens(r)).toEqual(["Milk"]);
  });

  it("“May contain traces of⏎peanuts” gives Caution (the wrap no longer hides the may-contain)", () => {
    const text = "May contain traces of\npeanuts";
    // Without joining, the line break ends the may-contain span: peanuts reads as an ingredient.
    expect(checkAllergens(text, [p("peanut")]).verdict).toBe("unsafe");
    const r = checkAllergens(joinOcrLines(text), [p("peanut")]);
    expect(r.verdict).toBe("caution");
    expect(r.matches.map((m) => m.kind)).toEqual(["may_contain"]);
  });

  it("“May contain peanuts,⏎Milk solids” stays Unsafe for milk (a misread full stop)", () => {
    expect(checkAllergens(joinOcrLines("May contain peanuts,\nMilk solids, sugar"), [p("milk")]).verdict).toBe("unsafe");
  });

  it("“Milk-⏎free chocolate” stays a free-from claim (Caution, never Safe)", () => {
    const r = checkAllergens(joinOcrLines("Milk-\nfree chocolate: sugar, cocoa"), [p("milk")]);
    expect(r.verdict).toBe("caution");
    expect(r.warnings.map((w) => w.kind)).toContain("free_from_claim");
  });

  it("“May contain nuts⏎milk, sugar” stays Unsafe for milk (Phase 3 case)", () => {
    const r = checkAllergens(joinOcrLines("May contain nuts\nmilk, sugar"), [p("milk")]);
    expect(r.verdict).toBe("unsafe");
  });

  it("a hyphen-split allergen word is still found", () => {
    expect(checkAllergens(joinOcrLines("Noodles: rice, glu-\nten, salt"), [p("wheat_gluten")]).verdict).toBe("unsafe");
  });
});

// Every Unsafe call the Phase 3 and Phase 4 test suites make to checkAllergens()
// (check.test.ts, highlight.test.ts, verdict-view.test.tsx, scan-record.test.ts),
// recorded on 2026-10-28 by wrapping checkAllergens() during a test run and kept
// once per distinct (text, allergens, options). Re-record it if new Unsafe
// cases are added to those suites.
type RecordedCall = { text: string | null; allergens: CheckAllergen[]; options: CheckOptions };

describe("joinOcrLines never weakens a Phase 3 or Phase 4 Unsafe case", () => {
  const calls = unsafeCheckCalls as RecordedCall[];

  it("the recorded corpus is all Unsafe before joining", () => {
    expect(calls.length).toBeGreaterThan(90);
    for (const c of calls) expect(checkAllergens(c.text, c.allergens, c.options).verdict).toBe("unsafe");
  });

  it.each(calls.map((c, i) => [i, JSON.stringify(c.text).slice(0, 60), c] as const))(
    "recorded case %i: %s",
    (_i, _label, c) => {
      expectNotWeaker(c.text, c.allergens, c.options);
    },
  );

  // Real Open Food Facts responses for the Phase 4 live-verdict products
  // (fetched 2026-10-28), checked the same way as the barcode Server Function.
  const MILK_PEANUT_WHEAT = [p("milk"), p("peanut"), p("wheat_gluten")];
  it.each(Object.entries(offProducts))("Open Food Facts product %s (milk + peanut + wheat)", (_barcode, json) => {
    const product = parseProduct(json);
    expect(product.found).toBe(true);
    if (!product.found) return;
    const options: CheckOptions = { incomplete: product.incomplete, declared: product.declared };
    expect(checkAllergens(product.ingredientsText, MILK_PEANUT_WHEAT, options).verdict).toBe("unsafe");
    expectNotWeaker(product.ingredientsText, MILK_PEANUT_WHEAT, options);
  });
});
