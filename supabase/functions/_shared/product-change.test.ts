import { describe, expect, it } from "vitest";
import type { CheckAllergen } from "../../../src/lib/allergen/check.ts";
import { dataKey, describeChanges, evaluateChange, normalizeForCompare, type ProductData } from "./product-change.ts";

const MILK: CheckAllergen[] = [{ kind: "predefined", code: "milk" }];
const MILK_PEANUT: CheckAllergen[] = [
  { kind: "predefined", code: "milk" },
  { kind: "predefined", code: "peanut" },
];

const data = (ingredientsText: string | null, more: Partial<ProductData> = {}): ProductData => ({
  ingredientsText,
  contains: [],
  mayContain: [],
  incomplete: false,
  ...more,
});

describe("normalizeForCompare / dataKey", () => {
  it("ignores spacing, capitals and punctuation", () => {
    expect(normalizeForCompare("Sugar,  Palm OIL; hazelnuts (13%).")).toBe(normalizeForCompare("sugar palm oil hazelnuts 13%"));
    expect(dataKey(data("Sugar, Palm oil"))).toBe(dataKey(data("sugar palm  oil.")));
  });

  it("ignores the order and repeats of tags, but not their content", () => {
    expect(dataKey(data("x", { contains: ["milk", "soybeans"] }))).toBe(dataKey(data("x", { contains: ["Soybeans", "milk", "milk"] })));
    expect(dataKey(data("x", { contains: ["milk"] }))).not.toBe(dataKey(data("x", { mayContain: ["milk"] })));
  });

  it("notices a real word change and the incomplete flag", () => {
    expect(dataKey(data("sugar, cocoa"))).not.toBe(dataKey(data("sugar, milk")));
    expect(dataKey(data("sugar"))).not.toBe(dataKey(data("sugar", { incomplete: true })));
  });

  it("treats a missing text like an empty one", () => {
    expect(dataKey(data(null))).toBe(dataKey(data("  ")));
  });
});

describe("evaluateChange", () => {
  it("formatting-only changes are unchanged, even when they'd be checked differently", () => {
    expect(evaluateChange(data("Sugar, cocoa"), data("SUGAR cocoa."), MILK)).toEqual({ outcome: "unchanged" });
  });

  it("Safe → Unsafe: alerts with what changed", () => {
    const e = evaluateChange(data("sugar, cocoa"), data("sugar, cocoa, whey powder"), MILK);
    expect(e.outcome).toBe("alert");
    if (e.outcome !== "alert") return;
    expect(e.before.verdict).toBe("safe");
    expect(e.after.verdict).toBe("unsafe");
    expect(e.changes).toEqual([{ allergen: "Milk", kind: "contains", text: "whey" }]);
    expect(e.summary).toBe("now lists milk (whey)");
  });

  it("Safe → Caution from a new trace: alerts", () => {
    const e = evaluateChange(data("sugar, cocoa"), data("sugar, cocoa", { mayContain: ["milk"] }), MILK);
    expect(e.outcome).toBe("alert");
    if (e.outcome !== "alert") return;
    expect(e.after.verdict).toBe("caution");
    expect(e.summary).toBe("now says it may contain milk");
  });

  it("Caution → Unsafe for the same allergen: alerts", () => {
    const e = evaluateChange(
      data("sugar, cocoa", { mayContain: ["milk"] }),
      data("sugar, cocoa, skimmed milk powder", { mayContain: ["milk"] }),
      MILK,
    );
    expect(e.outcome).toBe("alert");
    if (e.outcome === "alert") expect(e.summary).toBe("now lists milk");
  });

  it("a new allergen of the user's with the same verdict (Unsafe → Unsafe) alerts", () => {
    const e = evaluateChange(data("sugar, milk"), data("sugar, milk, peanuts"), MILK_PEANUT);
    expect(e.outcome).toBe("alert");
    if (e.outcome !== "alert") return;
    expect(e.before.verdict).toBe("unsafe");
    expect(e.after.verdict).toBe("unsafe");
    expect(e.changes.map((c) => c.allergen)).toEqual(["Peanut"]);
  });

  it("the same allergen found in a new word is not a new allergen when the verdict stays", () => {
    const e = evaluateChange(data("sugar, milk"), data("sugar, milk, whey"), MILK);
    expect(e.outcome).toBe("changed");
  });

  it("is checked with the user's CURRENT allergens: the product isn't blamed for a profile change", () => {
    // The snapshot already contained peanuts; the user added Peanut to their
    // profile since. The product only changed its sugar.
    const e = evaluateChange(data("sugar, peanuts"), data("cane sugar, peanuts"), MILK_PEANUT);
    expect(e.outcome).toBe("changed");
  });

  it("improvements don't alert", () => {
    expect(evaluateChange(data("sugar, milk"), data("sugar, oat drink"), MILK).outcome).toBe("improved");
    expect(evaluateChange(data("sugar", { mayContain: ["milk"] }), data("sugar"), MILK).outcome).toBe("improved");
  });

  it("other changes that don't concern the user's allergens don't alert", () => {
    expect(evaluateChange(data("sugar, cocoa"), data("sugar, cocoa, eggs"), MILK).outcome).toBe("changed");
  });

  it("a removed ingredient list never alerts", () => {
    expect(evaluateChange(data("sugar, cocoa"), data(null), MILK)).toEqual({ outcome: "no_ingredients" });
    expect(evaluateChange(data("sugar, cocoa"), data("   "), MILK)).toEqual({ outcome: "no_ingredients" });
  });

  it("Safe → Caution only because the data is now incomplete doesn't alert", () => {
    const e = evaluateChange(data("sugar, cocoa"), data("sugar, cocoa, salt", { incomplete: true }), MILK);
    expect(e.outcome).toBe("data_incomplete");
  });

  it("an earlier snapshot without ingredients, now listing an allergen, alerts", () => {
    const e = evaluateChange(data(null), data("sugar, milk"), MILK);
    expect(e.outcome).toBe("alert");
  });
});

describe("describeChanges", () => {
  it("joins up to three changes and counts the rest", () => {
    expect(
      describeChanges([
        { allergen: "Milk", kind: "contains", text: "whey" },
        { allergen: "Peanut", kind: "may_contain", text: "peanuts" },
      ]),
    ).toBe("now lists milk (whey) and says it may contain peanut");
    expect(describeChanges([{ allergen: "Soy", kind: "possible_source", text: "lecithin" }])).toBe(
      "now lists lecithin, which may come from soy",
    );
    expect(
      describeChanges([
        { allergen: "A", kind: "contains", text: "a" },
        { allergen: "B", kind: "contains", text: "b" },
        { allergen: "C", kind: "contains", text: "c" },
        { allergen: "D", kind: "contains", text: "d" },
      ]),
    ).toBe("now lists a, lists b, lists c and 1 more");
  });
});
