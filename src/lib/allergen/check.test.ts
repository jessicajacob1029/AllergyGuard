import { describe, expect, it } from "vitest";
import type { AllergenCode } from "./codes";
import { checkAllergens, type CheckAllergen, type CheckResult } from "./check";

const p = (code: AllergenCode): CheckAllergen => ({ kind: "predefined", code });
const c = (name: string): CheckAllergen => ({ kind: "custom", name });

const MILK = [p("milk")];

function texts(result: CheckResult, kind?: "contains" | "may_contain"): string[] {
  return result.matches.filter((m) => !kind || m.kind === kind).map((m) => m.text);
}

function warningKinds(result: CheckResult): string[] {
  return result.warnings.map((w) => w.kind);
}

describe("checkAllergens: plan 'Done when' cases", () => {
  it("direct match is Unsafe and names the ingredient", () => {
    const r = checkAllergens("Sugar, skimmed milk powder, cocoa", MILK);
    expect(r.verdict).toBe("unsafe");
    expect(texts(r, "contains")).toEqual(["milk"]);
    expect(r.matches[0].allergen).toBe("Milk");
    expect(r.explanation).toMatch(/milk/i);
  });

  it("synonym match is Unsafe", () => {
    const r = checkAllergens("Sugar, whey powder, emulsifier", MILK);
    expect(r.verdict).toBe("unsafe");
    expect(r.matches[0]).toMatchObject({ allergen: "Milk", term: "whey", text: "whey", kind: "contains" });
    expect(r.explanation).toContain("whey");
  });

  it("may contain is Caution", () => {
    const r = checkAllergens("Sugar, cocoa mass. May contain traces of peanuts.", [p("peanut")]);
    expect(r.verdict).toBe("caution");
    expect(texts(r, "may_contain")).toEqual(["peanuts"]);
    expect(texts(r, "contains")).toEqual([]);
  });

  it.each([null, undefined, "", "   ", "..., ;"])("missing or empty text %j is Caution, never Safe", (text) => {
    const r = checkAllergens(text, MILK);
    expect(r.verdict).toBe("caution");
    expect(warningKinds(r)).toContain("missing_text");
    expect(r.matches).toEqual([]);
    expect(r.rawText).toBe(text ?? "");
  });

  it("clean text is Safe", () => {
    const r = checkAllergens("Water, sugar, salt, citric acid", [p("milk"), p("peanut")]);
    expect(r.verdict).toBe("safe");
    expect(r.matches).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.explanation).toMatch(/Milk/);
    expect(r.explanation).toMatch(/label/i);
  });

  it("Unsafe is never downgraded when a may-contain also exists", () => {
    const r = checkAllergens("Milk chocolate (sugar, cocoa butter, whey). May contain milk and nuts.", MILK);
    expect(r.verdict).toBe("unsafe");
    expect(texts(r, "contains")).toEqual(["Milk", "whey"]);
    expect(texts(r, "may_contain")).toEqual(["milk"]);
  });

  it("Unsafe is never downgraded by low OCR confidence or incomplete data", () => {
    const r = checkAllergens("whey", MILK, { ocrConfidence: 20, incomplete: true });
    expect(r.verdict).toBe("unsafe");
    expect(warningKinds(r)).toEqual(expect.arrayContaining(["low_confidence", "incomplete"]));
  });
});

describe("checkAllergens: result shape", () => {
  it("returns the raw text unchanged and exact original excerpts", () => {
    const raw = "Sugar, _WHEY_ powder, sodium cas-\nein";
    const r = checkAllergens(raw, MILK);
    expect(r.rawText).toBe(raw);
    expect(texts(r)).toEqual(["WHEY", "cas-\nein"]);
  });

  it("every verdict has an explanation", () => {
    for (const text of ["milk", "may contain milk", "water", ""]) {
      expect(checkAllergens(text, MILK).explanation.trim()).not.toBe("");
    }
  });

  it("severity is ignored: a mild allergy still gives Unsafe", () => {
    const allergens = [{ kind: "predefined" as const, code: "milk" as const, severity: "mild" as const }];
    expect(checkAllergens("butter", allergens).verdict).toBe("unsafe");
  });

  it("the explanation names a word once, whatever its case (Maggi: 'wheat' and 'Wheat')", () => {
    const r = checkAllergens("Refined wheat flour, salt, Wheat gluten", [p("wheat_gluten")]);
    expect(r.verdict).toBe("unsafe");
    expect(texts(r, "contains")).toContain("Wheat"); // every match is still kept for highlighting
    expect(r.explanation).toContain("“wheat”");
    expect(r.explanation).not.toContain("“Wheat”");
  });

  it("only the user's allergens count", () => {
    expect(checkAllergens("Wheat flour, egg, soy", MILK).verdict).toBe("safe");
  });

  it("no allergens in the profile is Caution, not Safe", () => {
    const r = checkAllergens("Water, sugar", []);
    expect(r.verdict).toBe("caution");
    expect(warningKinds(r)).toContain("no_allergens");
  });
});

describe("checkAllergens: custom allergens (decided in US-07)", () => {
  it("custom 'whey' is mapped to milk, so milk and casein are Unsafe", () => {
    const r = checkAllergens("Skimmed milk powder, casein", [c("whey")]);
    expect(r.verdict).toBe("unsafe");
    expect(r.matches.map((m) => [m.allergen, m.text])).toEqual([
      ["whey", "milk"],
      ["whey", "casein"],
    ]);
  });

  it("custom 'dairy' is mapped to milk", () => {
    const r = checkAllergens("Sugar, sodium caseinate", [c("Dairy")]);
    expect(r.verdict).toBe("unsafe");
    expect(texts(r)).toEqual(["caseinate"]);
  });

  it("a custom allergen with no synonym is matched as literal text, plurals included", () => {
    expect(checkAllergens("Apple, kiwis, lime", [c("Kiwi")]).verdict).toBe("unsafe");
    expect(checkAllergens("Lupin flour", [c("lupin")]).verdict).toBe("unsafe");
    expect(checkAllergens("Apple, lime", [c("kiwi")]).verdict).toBe("safe");
  });

  it("custom names with regex characters are safe to match", () => {
    expect(checkAllergens("Colour (E120), sugar", [c("E120)")]).verdict).toBe("unsafe");
    // Unescaped, "e.g." would match "eggs".
    expect(checkAllergens("Contains eggs", [c("e.g.")]).verdict).toBe("safe");
  });
});

describe("checkAllergens: words and formatting", () => {
  it("does not match inside other words", () => {
    const r = checkAllergens("Eggplant, nutmeg, coconut, buckwheat, butternut squash", [
      p("egg"),
      p("tree_nuts"),
      p("wheat_gluten"),
    ]);
    expect(r.verdict).toBe("safe");
  });

  it.each([
    ["Cocoa butter, sugar", "milk", "safe"],
    ["Shea butter", "milk", "safe"],
    ["Coconut milk, water", "milk", "safe"],
    ["Cream of tartar", "milk", "safe"],
    ["Almond milk", "milk", "safe"],
    ["Almond milk", "tree_nuts", "unsafe"],
    ["Peanut butter", "milk", "safe"],
    ["Peanut butter", "peanut", "unsafe"],
    ["Water chestnut", "tree_nuts", "safe"],
    ["Bean curd", "milk", "safe"],
    ["Bean curd", "soy", "unsafe"],
  ] as const)("%j for %s is %s", (text, code, verdict) => {
    expect(checkAllergens(text, [p(code)]).verdict).toBe(verdict);
  });

  it("an excluded phrase does not hide a real match elsewhere", () => {
    const r = checkAllergens("Cocoa butter, butter, sugar", MILK);
    expect(r.verdict).toBe("unsafe");
    expect(texts(r)).toEqual(["butter"]);
  });

  it.each([
    ["peanut", ["Groundnut", "Groundnut oil", "Moongphali", "Moongfali", "Arachis oil"]],
    [
      "milk",
      ["Ghee", "Paneer", "Khoa", "Khoya", "Curd", "Dahi", "Malai", "Buttermilk", "Chhena", "Chenna",
        "Milk solids", "Casein", "Sodium caseinate"],
    ],
    ["tree_nuts", ["Kaju", "Badam", "Pista", "Akhrot"]],
    ["wheat_gluten", ["Sooji", "Suji", "Rava", "Semolina", "Dalia", "Daliya"]],
    ["fish", ["Fish sauce", "Surimi"]],
  ] as const)("Indian and common label terms for %s are Unsafe", (code, labels) => {
    for (const text of labels) {
      expect(checkAllergens(text, [p(code)]).verdict, text).toBe("unsafe");
    }
  });

  it("rice rava and idli rava are not wheat", () => {
    expect(checkAllergens("Rice rava", [p("wheat_gluten")]).verdict).toBe("safe");
    expect(checkAllergens("Idli rava", [p("wheat_gluten")]).verdict).toBe("safe");
  });
});

describe("checkAllergens: may contain and shared facilities", () => {
  it.each([
    "Made in a factory that also handles milk.",
    "Produced on shared equipment with milk.",
    "Manufactured on a line that processes milk",
    "May also contain milk.",
    "Trace of milk",
    "Not suitable for people with a milk allergy.",
  ])("%j is Caution", (text) => {
    const r = checkAllergens(`Sugar, cocoa. ${text}`, MILK);
    expect(r.verdict).toBe("caution");
    expect(texts(r, "may_contain")).toEqual(["milk"]);
  });

  it("the may-contain span ends at a full stop", () => {
    expect(checkAllergens("May contain nuts. Ingredients: milk, sugar", MILK).verdict).toBe("unsafe");
  });

  it("the may-contain span ends at a line break (OCR advice above the ingredients)", () => {
    expect(checkAllergens("May contain nuts\nmilk, sugar", MILK).verdict).toBe("unsafe");
  });

  it("the may-contain span ends at 'contains'", () => {
    expect(checkAllergens("May contain nuts, contains milk", MILK).verdict).toBe("unsafe");
  });

  it("a decimal point does not end the span", () => {
    const r = checkAllergens("Salt 0.5%. May contain 0.1% milk", MILK);
    expect(r.verdict).toBe("caution");
  });

  it("EU wording: crustaceans and molluscs are shellfish", () => {
    const r = checkAllergens("Pasta, egg. Packed in a facility that handles fish, crustaceans", [p("shellfish")]);
    expect(r.verdict).toBe("caution");
    expect(texts(r, "may_contain")).toEqual(["crustaceans"]);
    expect(checkAllergens("Molluscs", [p("shellfish")]).verdict).toBe("unsafe");
  });

  it("an ingredient before a facility phrase stays Unsafe", () => {
    expect(checkAllergens("Made with fresh milk in a factory that handles nuts.", MILK).verdict).toBe("unsafe");
  });
});

describe("checkAllergens: free-from claims", () => {
  it.each([
    ["Dairy-free spread: vegetable oils, salt", "milk"],
    ["Milk free. Sugar, cocoa", "milk"],
    ["Non-dairy creamer: glucose syrup, coconut oil", "milk"],
    ["Free from milk, egg and gluten. Rice, water", "egg"],
    ["Free from milk, egg and gluten. Rice, water", "wheat_gluten"],
    ["No milk. Rice, water", "milk"],
    ["Made without nuts. Oats, honey", "tree_nuts"],
    ["Contains no peanuts or tree nuts. Oats", "tree_nuts"],
    ["Contains no peanuts or tree nuts. Oats", "peanut"],
    ["Does not contain gluten. Rice", "wheat_gluten"],
    ["Gluten-free bread: rice, water", "wheat_gluten"],
    ["Dairy & gluten free. Rice", "milk"],
    ["Dairy and gluten free. Rice", "wheat_gluten"],
    ["Eggless mayonnaise (oil, water, sugar)", "egg"],
    // Split across two lines on a label photo (Phase 5).
    ["Milk-\nfree chocolate: sugar, cocoa", "milk"],
    ["Gluten-\r\nfree bread: rice, water", "wheat_gluten"],
  ] as const)("a claim alone is Caution: %j for %s", (text, code) => {
    const r = checkAllergens(text, [p(code)]);
    expect(r.verdict).toBe("caution");
    expect(r.matches).toEqual([]);
    expect(warningKinds(r)).toContain("free_from_claim");
  });

  it.each([
    "Dairy-free chocolate: sugar, cocoa butter, whey powder",
    "Non-dairy creamer (glucose syrup, sodium caseinate)",
    "Lactose-free milk",
    "Milk-free recipe. Contains: milk",
    "No milk added. Ingredients: cream, sugar",
    "Without milk, sugar, cream",
  ])("a real ingredient still wins over a claim: %j is Unsafe", (text) => {
    const r = checkAllergens(text, MILK);
    expect(r.verdict).toBe("unsafe");
    expect(warningKinds(r)).toContain("free_from_claim");
  });

  it("a claim list stops at the first non-allergen word", () => {
    const r = checkAllergens("Made without nuts, contains wheat flour, milk.", [p("wheat_gluten"), p("milk")]);
    expect(r.verdict).toBe("unsafe");
    expect(texts(r, "contains")).toEqual(["wheat", "milk"]);
  });

  it("a claim about another allergen doesn't affect the verdict", () => {
    expect(checkAllergens("Egg-free pasta: rice, water", MILK).verdict).toBe("safe");
  });
});

describe("checkAllergens: nuts for a peanut allergy", () => {
  const PEANUT = [p("peanut")];

  it.each(["Nuts", "Mixed nuts", "Nut pieces", "Sugar, nuts, salt", "May contain nuts."])(
    "%j is Caution for peanut, never Safe",
    (text) => {
      const r = checkAllergens(text, PEANUT);
      expect(r.verdict).toBe("caution");
      expect(r.explanation).toMatch(/The label says “nuts?”; this may include peanuts\./i);
    },
  );

  it("a nut-free claim is reported as a claim for peanut too", () => {
    const r = checkAllergens("Nut-free. Oats, honey", PEANUT);
    expect(r.verdict).toBe("caution");
    expect(warningKinds(r)).toEqual(["free_from_claim"]);
  });

  it.each(["Cashew nuts", "Brazil nuts", "Pine nuts", "Mixed nuts (almonds, cashews)"])(
    "a named nut settles it: %j is not flagged for peanut",
    (text) => {
      expect(checkAllergens(text, PEANUT).verdict).toBe("safe");
    },
  );

  it("mixed nuts that list peanuts are Unsafe", () => {
    expect(checkAllergens("Mixed nuts (almonds, peanuts)", PEANUT).verdict).toBe("unsafe");
  });

  it("does not match peanut or words containing nut", () => {
    expect(checkAllergens("Nutmeg, coconut, doughnut", PEANUT).verdict).toBe("safe");
    expect(warningKinds(checkAllergens("Peanuts", PEANUT))).toEqual([]);
  });

  it("bare nuts is still Unsafe for a tree nut allergy", () => {
    expect(checkAllergens("Mixed nuts", [p("tree_nuts")]).verdict).toBe("unsafe");
  });
});

describe("checkAllergens: Worcestershire sauce for a fish allergy", () => {
  const FISH = [p("fish")];

  it.each(["Worcestershire sauce", "Vinegar, Worcester sauce, salt"])("%j is Caution for fish", (text) => {
    const r = checkAllergens(text, FISH);
    expect(r.verdict).toBe("caution");
    expect(r.warnings).toContainEqual(expect.objectContaining({ kind: "possible_source", allergen: "Fish" }));
    expect(r.explanation).toMatch(/usually made with anchovies/);
  });

  it("listed anchovies are Unsafe", () => {
    expect(checkAllergens("Worcestershire sauce (vinegar, anchovies)", FISH).verdict).toBe("unsafe");
  });

  // Still Caution: a free-from claim on its own is Caution (Phase 3 rule). The
  // Worcestershire warning is dropped because the label settles it.
  it.each(["Anchovy-free Worcestershire sauce", "Worcestershire sauce (anchovy free)", "Worcestershire sauce (no fish)"])(
    "an anchovy-free label settles it: %j gives only the claim warning",
    (text) => {
      const r = checkAllergens(text, FISH);
      expect(r.verdict).toBe("caution");
      expect(warningKinds(r)).toEqual(["free_from_claim"]);
    },
  );

  it("doesn't matter without a fish allergy", () => {
    expect(checkAllergens("Worcestershire sauce", MILK).verdict).toBe("safe");
  });
});

describe("checkAllergens: hing / asafoetida for a wheat allergy", () => {
  const WHEAT = [p("wheat_gluten")];

  it.each(["Hing", "Asafoetida", "Asafetida", "Spices (coriander, hing)", "Hing (asafoetida)"])(
    "%j is Caution for wheat",
    (text) => {
      const r = checkAllergens(text, WHEAT);
      expect(r.verdict).toBe("caution");
      expect(r.explanation).toMatch(/often mixed with wheat flour/);
    },
  );

  it("a term repeated in its own brackets is one ingredient, reported once", () => {
    const hing = checkAllergens("Hing (asafoetida)", WHEAT);
    expect(hing.warnings).toHaveLength(1);
    expect(hing.explanation.match(/wheat flour/g)).toHaveLength(1);
    const lecithin = checkAllergens("Emulsifier: lecithin (E322)", [p("soy")]);
    expect(lecithin.warnings).toHaveLength(1);
  });

  it("compounded hing that lists wheat flour is Unsafe", () => {
    expect(checkAllergens("Asafoetida (wheat flour, gum arabic)", WHEAT).verdict).toBe("unsafe");
  });

  it("compounded hing that lists rice flour as the base is settled", () => {
    expect(checkAllergens("Hing (asafoetida, rice flour, gum arabic)", WHEAT).verdict).toBe("safe");
  });

  it("does not match inside other words", () => {
    expect(checkAllergens("Nothing, hinge", WHEAT).verdict).toBe("safe");
  });
});

describe("checkAllergens: ambiguous terms", () => {
  const SOY = [p("soy")];
  const WHEAT = [p("wheat_gluten")];

  it.each(["Emulsifier: lecithin", "Emulsifier (E322)", "Emulsifier (INS 322)", "Emulsifiers (322, 471)", "e-322"])(
    "%j is Caution for soy",
    (text) => {
      const r = checkAllergens(text, SOY);
      expect(r.verdict).toBe("caution");
      expect(r.warnings).toContainEqual(expect.objectContaining({ kind: "possible_source", allergen: "Soy" }));
    },
  );

  it.each(["Emulsifier: soy lecithin", "Emulsifier: lecithin (soy)", "Soya lecithin (E322)", "lecithin (from soya)"])(
    "a stated soy source makes %j Unsafe",
    (text) => {
      const r = checkAllergens(text, SOY);
      expect(r.verdict).toBe("unsafe");
      expect(warningKinds(r)).not.toContain("possible_source");
    },
  );

  it.each(["Sunflower lecithin", "Sunflower lecithin (E322)", "Lecithin (sunflower)", "Rapeseed lecithin"])(
    "a stated non-allergen source makes %j Safe",
    (text) => {
      expect(checkAllergens(text, SOY).verdict).toBe("safe");
    },
  );

  it("lecithin doesn't matter to someone without a soy allergy", () => {
    expect(checkAllergens("Lecithin", MILK).verdict).toBe("safe");
  });

  it.each(["Flour, sugar", "Plain flour"])("bare %j is Caution for wheat", (text) => {
    const r = checkAllergens(text, WHEAT);
    expect(r.verdict).toBe("caution");
    expect(r.warnings).toContainEqual(
      expect.objectContaining({ kind: "possible_source", term: "flour", text: expect.stringMatching(/flour/i) }),
    );
  });

  it.each(["Flour (wheat)", "Wheat flour", "Maida", "Atta", "Whole wheat atta", "Maida (refined wheat flour)"])(
    "%j is Unsafe for wheat",
    (text) => {
      expect(checkAllergens(text, WHEAT).verdict).toBe("unsafe");
    },
  );

  it.each(["Rice flour", "Gram flour", "Besan", "Gram flour (besan)", "Chickpea flour", "Cornflour"])(
    "%j is Safe for wheat",
    (text) => {
      expect(checkAllergens(text, WHEAT).verdict).toBe("safe");
    },
  );

  it("hydrolysed vegetable protein is Caution for both soy and wheat", () => {
    expect(checkAllergens("Hydrolysed vegetable protein", SOY).verdict).toBe("caution");
    expect(checkAllergens("Hydrolysed vegetable protein", WHEAT).verdict).toBe("caution");
    const both = checkAllergens("Hydrolyzed vegetable protein, salt", [p("soy"), p("wheat_gluten")]);
    expect(both.warnings.filter((w) => w.kind === "possible_source")).toHaveLength(2);
  });

  it("hydrolysed vegetable protein with a stated source is settled both ways", () => {
    expect(checkAllergens("Hydrolysed vegetable protein (soy)", SOY).verdict).toBe("unsafe");
    expect(checkAllergens("Hydrolysed vegetable protein (soy)", WHEAT).verdict).toBe("safe");
    expect(checkAllergens("Hydrolysed vegetable protein (wheat)", WHEAT).verdict).toBe("unsafe");
    expect(checkAllergens("Hydrolysed vegetable protein (wheat)", SOY).verdict).toBe("safe");
  });
});

describe("checkAllergens: explanation wording", () => {
  it("one sentence per claim, naming every allergen it concerns", () => {
    const r = checkAllergens("Dairy & gluten free. Rice", [p("milk"), p("wheat_gluten")]);
    expect(r.explanation).toContain("“Dairy & gluten free”, but a claim is not proof for Milk and Wheat / gluten.");
  });

  it("names the ambiguous term when the label used a code", () => {
    const r = checkAllergens("Emulsifiers (322, 471)", [p("soy")]);
    expect(r.explanation).toContain("“322” (lecithin) can come from Soy");
  });
});

describe("checkAllergens: low confidence and incomplete data", () => {
  it("low OCR confidence makes clean text Caution", () => {
    const r = checkAllergens("Water, sugar", MILK, { ocrConfidence: 40 });
    expect(r.verdict).toBe("caution");
    expect(r.warnings).toContainEqual({ kind: "low_confidence", confidence: 40 });
  });

  it("good OCR confidence keeps clean text Safe", () => {
    expect(checkAllergens("Water, sugar", MILK, { ocrConfidence: 90 }).verdict).toBe("safe");
  });

  it("the confidence threshold can be raised", () => {
    const r = checkAllergens("Water, sugar", MILK, { ocrConfidence: 90, minOcrConfidence: 95 });
    expect(r.verdict).toBe("caution");
  });

  it("a confidence that isn't a number counts as low", () => {
    expect(checkAllergens("Water", MILK, { ocrConfidence: Number.NaN }).verdict).toBe("caution");
  });

  it("incomplete data makes clean text Caution", () => {
    const r = checkAllergens("Water, sugar", MILK, { incomplete: true });
    expect(r.verdict).toBe("caution");
    expect(warningKinds(r)).toEqual(["incomplete"]);
  });
});

describe("checkAllergens: match positions (for highlighting)", () => {
  it("gives each ingredient match its exact range in the raw text", () => {
    const raw = "Sugar, _WHEY_ powder, sodium cas-\nein";
    const r = checkAllergens(raw, MILK);
    for (const m of r.matches) {
      expect(m.source).toBe("ingredients");
      expect(raw.slice(m.start!, m.end!)).toBe(m.text);
    }
    expect(r.matches.map((m) => m.text)).toEqual(["WHEY", "cas-\nein"]);
  });

  it("ranges survive accents before the match", () => {
    const raw = "Crème fraîche, beurre, lait";
    const r = checkAllergens(raw, [c("lait")]);
    expect(raw.slice(r.matches[0].start!, r.matches[0].end!)).toBe("lait");
  });
});

describe("checkAllergens: declared allergens from product data", () => {
  // Real Open Food Facts data for Nutella (2026-10-26): the ingredient text is
  // incomplete, but the product's allergen tags list milk, nuts and soy.
  const nutella = { contains: ["milk", "nuts", "soybeans"], mayContain: [] };

  it("a declared allergen is Unsafe even when the ingredient text misses it", () => {
    const r = checkAllergens("sugar, palm oil", MILK, { declared: nutella });
    expect(r.verdict).toBe("unsafe");
    expect(r.matches).toEqual([
      expect.objectContaining({ allergen: "Milk", text: "milk", kind: "contains", source: "declared", start: null, end: null }),
    ]);
    expect(r.explanation).toMatch(/allergen list says it contains Milk/);
  });

  it.each([
    ["tree_nuts", "unsafe"],
    ["soy", "unsafe"],
    // No egg declared, but the text is provably incomplete (see below): never Safe.
    ["egg", "caution"],
  ] as const)("Nutella for %s is %s", (code, verdict) => {
    expect(checkAllergens("sugar, palm oil", [p(code)], { declared: nutella }).verdict).toBe(verdict);
  });

  it("declared 'nuts' is never Safe for a peanut allergy (same rule as label text)", () => {
    const r = checkAllergens("sugar, palm oil", [p("peanut")], { declared: nutella });
    expect(r.verdict).toBe("caution");
    expect(r.warnings).toContainEqual(expect.objectContaining({ kind: "possible_source", allergen: "Peanut" }));
  });

  it("a declared trace is Caution", () => {
    const r = checkAllergens("oats, honey", [p("peanut")], { declared: { contains: [], mayContain: ["peanuts"] } });
    expect(r.verdict).toBe("caution");
    expect(r.matches).toEqual([expect.objectContaining({ kind: "may_contain", source: "declared" })]);
    expect(r.explanation).toMatch(/allergen list says it may contain Peanut/);
  });

  it.each([
    ["crustaceans", "shellfish"],
    ["molluscs", "shellfish"],
    ["sesame seeds", "sesame"],
    ["gluten", "wheat_gluten"],
    ["eggs", "egg"],
  ] as const)("declared %j is matched as %s", (name, code) => {
    expect(checkAllergens("water", [p(code)], { declared: { contains: [name], mayContain: [] } }).verdict).toBe(
      "unsafe",
    );
  });

  it("matches a custom allergen by name", () => {
    const declared = { contains: ["lupin", "celery"], mayContain: [] };
    expect(checkAllergens("water", [c("Lupin")], { declared }).verdict).toBe("unsafe");
    // Not kiwi, but lupin and celery are missing from the text, so it is incomplete.
    expect(checkAllergens("water, lupin, celery", [c("kiwi")], { declared }).verdict).toBe("safe");
  });

  it("a declared allergen with no ingredient text is still Unsafe, and the missing text is reported", () => {
    const r = checkAllergens(null, MILK, { declared: { contains: ["milk"], mayContain: [] } });
    expect(r.verdict).toBe("unsafe");
    expect(warningKinds(r)).toContain("missing_text");
  });

  it("when the text already found the allergen, the explanation doesn't repeat it", () => {
    const r = checkAllergens("Sugar, whey", MILK, { declared: { contains: ["milk"], mayContain: [] } });
    expect(r.verdict).toBe("unsafe");
    expect(r.explanation).toMatch(/contains Milk \(“whey”\)/);
    expect(r.explanation).not.toMatch(/allergen list/);
  });

  it("names a declared allergen the text missed", () => {
    const r = checkAllergens("Sugar, whey", [p("milk"), p("soy")], { declared: nutella });
    expect(r.explanation).toMatch(/allergen list also says it contains Soy/);
  });
});

describe("checkAllergens: declared and text saying the same thing", () => {
  it("doesn't repeat a may-contain the label text already gave", () => {
    const r = checkAllergens("Oats. May contain peanuts.", [p("peanut")], { declared: { contains: [], mayContain: ["peanuts"] } });
    expect(r.explanation.match(/may contain Peanut/g)).toHaveLength(1);
  });
});

describe("checkAllergens: declared allergens prove the text is incomplete", () => {
  const nutella = { contains: ["milk", "nuts", "soybeans"], mayContain: [] };

  it("an allergen list that mentions things missing from the text makes it Caution, not Safe", () => {
    const r = checkAllergens("sugar, palm oil", [p("egg")], { declared: nutella });
    expect(r.verdict).toBe("caution");
    expect(warningKinds(r)).toEqual(["incomplete"]);
  });

  it("is not triggered when the text contains every declared allergen", () => {
    const r = checkAllergens("Sugar, hazelnuts, skimmed milk powder, soy lecithin", [p("egg")], { declared: nutella });
    expect(r.verdict).toBe("safe");
  });

  it("also works for allergens we have no synonyms for", () => {
    const declared = { contains: ["celery"], mayContain: [] };
    expect(checkAllergens("Water, salt", MILK, { declared }).verdict).toBe("caution");
    expect(checkAllergens("Water, salt, celery", MILK, { declared }).verdict).toBe("safe");
  });

  it("declared traces don't count: they don't have to appear in the ingredient list", () => {
    const r = checkAllergens("Oats, honey", MILK, { declared: { contains: [], mayContain: ["peanuts"] } });
    expect(r.verdict).toBe("safe");
  });
});
