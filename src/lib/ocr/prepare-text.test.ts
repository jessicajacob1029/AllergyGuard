import { describe, expect, it } from "vitest";
import { checkAllergens, type CheckAllergen, type CheckOptions, type CheckResult, type Verdict } from "@/lib/allergen/check";
import type { AllergenCode } from "@/lib/allergen/codes";
import { parseProduct } from "@/lib/products/open-food-facts";
import offProducts from "./__fixtures__/off-products.json";
import unsafeCheckCalls from "./__fixtures__/unsafe-check-calls.json";
import { prepareOcrText, tidyOcrText } from "./prepare-text";

const p = (code: AllergenCode): CheckAllergen => ({ kind: "predefined", code });
const STRENGTH: Record<Verdict, number> = { safe: 0, caution: 1, unsafe: 2 };
const containsAllergens = (r: CheckResult) =>
  [...new Set(r.matches.filter((m) => m.kind === "contains").map((m) => m.allergen))].sort();

describe("tidyOcrText", () => {
  it.each([
    ["a standalone | (border) is removed", "Palm oil, | salt", "Palm oil, salt"],
    ["a | at the end of a line is removed", "Wheat gluten. |", "Wheat gluten."],
    ["a | touching punctuation is removed", "Humectant (451(i).|", "Humectant (451(i)."],
    ["a line of only | becomes empty (the break stays)", "Sugar,\n|\nsalt", "Sugar,\n\nsalt"],
    ["| before a letter is a misread l", "Mi|k powder", "Milk powder"],
    ["| at a word start is a misread l", "|ecithin", "lecithin"],
    ["a run of | before a letter is all l", "Mo||uscs", "Molluscs"],
    ["| after a word only is removed, so the word survives", "Wheat gluten|, salt", "Wheat gluten, salt"],
    ["line breaks are kept, including \\r\\n", "a |\r\nb", "a\r\nb"],
    ["text without | is unchanged", "Sugar,  salt ", "Sugar,  salt "],
  ])("%s", (_name, input, expected) => {
    expect(tidyOcrText(input)).toBe(expected);
  });

  it("“|ecithin” is found as lecithin: Caution for soy", () => {
    const r = checkAllergens(tidyOcrText("Emulsifier: |ecithin"), [p("soy")]);
    expect(r.verdict).toBe("caution");
    expect(r.warnings.map((w) => w.kind)).toContain("possible_source");
  });

  it("“Mi|k” is found as milk: Unsafe", () => {
    const r = checkAllergens(tidyOcrText("Sugar, Mi|k solids"), [p("milk")]);
    expect(r.verdict).toBe("unsafe");
    expect(containsAllergens(r)).toEqual(["Milk"]);
  });

  it("“gluten|” keeps gluten: Unsafe for wheat", () => {
    expect(checkAllergens(tidyOcrText("Wheat glu ten, gluten|"), [p("wheat_gluten")]).verdict).toBe("unsafe");
  });
});

// Same corpus as joinOcrLines(): every Unsafe checkAllergens() call made by the
// Phase 3/4 suites, plus the Phase 4 Open Food Facts products.
type RecordedCall = { text: string | null; allergens: CheckAllergen[]; options: CheckOptions };
const calls = unsafeCheckCalls as RecordedCall[];
const MILK_PEANUT_WHEAT = [p("milk"), p("peanut"), p("wheat_gluten")];
const offCases: RecordedCall[] = Object.values(offProducts).map((json) => {
  const product = parseProduct(json);
  if (!product.found) throw new Error("fixture product not found");
  return {
    text: product.ingredientsText,
    allergens: MILK_PEANUT_WHEAT,
    options: { incomplete: product.incomplete, declared: product.declared },
  };
});
const corpus = [...calls, ...offCases];

/** `variant` checked after `step` must be at least as strong as the original text. */
function expectNotWeaker(c: RecordedCall, variant: string, step: (t: string) => string) {
  const before = checkAllergens(c.text, c.allergens, c.options);
  const after = checkAllergens(step(variant), c.allergens, c.options);
  expect(STRENGTH[after.verdict], `${JSON.stringify(variant)}: ${before.verdict} → ${after.verdict}`).toBeGreaterThanOrEqual(
    STRENGTH[before.verdict],
  );
  expect(containsAllergens(after)).toEqual(expect.arrayContaining(containsAllergens(before)));
}

const withText = corpus.filter((c): c is RecordedCall & { text: string } => c.text !== null);
const label = (c: RecordedCall) => JSON.stringify(c.text).slice(0, 60);

describe("tidyOcrText and prepareOcrText never weaken a Phase 3 or Phase 4 Unsafe case", () => {
  it("the corpus is Unsafe before any step", () => {
    expect(corpus.length).toBeGreaterThan(95);
    for (const c of corpus) expect(checkAllergens(c.text, c.allergens, c.options).verdict).toBe("unsafe");
  });

  it.each(withText.map((c) => [label(c), c] as const))("tidy, unchanged text: %s", (_l, c) => {
    expectNotWeaker(c, c.text, tidyOcrText);
  });

  it.each(withText.map((c) => [label(c), c] as const))("tidy + join, unchanged text: %s", (_l, c) => {
    expectNotWeaker(c, c.text, prepareOcrText);
  });

  // The same text as OCR might return it: borders read as " |" at line ends
  // and every "l" misread as "|". Tidying must get back to at least the
  // original verdict.
  const asOcr = (t: string) =>
    t
      .split(/(\r?\n)/)
      .map((s) => (/\r?\n/.test(s) ? s : `${s.replace(/l/g, "|")} |`))
      .join("");
  it.each(withText.map((c) => [label(c), c] as const))("tidy + join, OCR-style | misreads: %s", (_l, c) => {
    expectNotWeaker(c, asOcr(c.text), prepareOcrText);
  });
});
