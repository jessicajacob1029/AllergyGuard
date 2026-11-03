import { describe, expect, it } from "vitest";
import { checkAllergens, type CheckAllergen, type CheckOptions } from "@/lib/allergen/check";
import type { AllergenCode } from "@/lib/allergen/codes";
import { parseProduct } from "@/lib/products/open-food-facts";
import offProducts from "./__fixtures__/off-products.json";
import ocrSamples from "./__fixtures__/ocr-samples.json";
import unsafeCheckCalls from "./__fixtures__/unsafe-check-calls.json";
import { checkLabelText, parseLabelCheckInput, type LabelCheckInput } from "./check-label";
import { prepareOcrText } from "./prepare-text";
import { summarizeOcr, type OcrLine } from "./summary";

const p = (code: AllergenCode): CheckAllergen => ({ kind: "predefined", code });

type Sample = { text: string; lines: OcrLine[] };
const samples = ocrSamples as Record<string, Sample>;

type PhotoInput = Extract<LabelCheckInput, { source: "photo" }>;

/** The photo path exactly as the app runs it: OCR text → tidy + joinOcrLines → checkLabelText. */
function photoInput(name: string): PhotoInput {
  const s = samples[name];
  return {
    source: "photo",
    text: prepareOcrText(s.text),
    ocrText: s.text,
    ocrConfidence: summarizeOcr(s.lines).confidence,
    textChecked: false,
  };
}

/** The barcode path exactly as the Server Function runs it. */
function barcodeVerdict(barcode: string, allergens: CheckAllergen[]) {
  const product = parseProduct((offProducts as Record<string, unknown>)[barcode]);
  if (!product.found) throw new Error("fixture product not found");
  return checkAllergens(product.ingredientsText, allergens, { incomplete: product.incomplete, declared: product.declared })
    .verdict;
}

const PROFILES: Record<string, CheckAllergen[]> = {
  kiwi: [{ kind: "custom", name: "kiwi" }],
  "milk + peanut + wheat": [p("milk"), p("peanut"), p("wheat_gluten")],
  milk: [p("milk")],
  wheat: [p("wheat_gluten")],
  peanut: [p("peanut")],
  soy: [p("soy")],
};

// Phase 5 "Done when": the same ingredients give the same verdict via barcode
// and via photo. Photo texts are real Tesseract.js 7 output (eng, best_int) on
// labels printed with the exact Open Food Facts ingredient text, 2026-10-28.
describe("same ingredients, same verdict: barcode vs label photo", () => {
  const cases: [string, string, string[]][] = [
    ["Maggi Masala noodles", "8901058851298", Object.keys(PROFILES)],
    ["Amul butter", "8901262010016", Object.keys(PROFILES)],
    // Not peanut: this product's Open Food Facts entry also declares traces of
    // nuts, which the printed ingredient text doesn't say, so the barcode
    // knows more than the label photo (Caution vs Safe). That's extra data,
    // not the same ingredients.
    ["Nutella (hazelnuts in the text)", "3017624010701", ["kiwi", "milk + peanut + wheat", "milk", "wheat", "soy"]],
  ];

  for (const [name, barcode, profiles] of cases) {
    it.each(profiles)(`${name}, %s profile`, (profile) => {
      const allergens = PROFILES[profile];
      const photo = checkLabelText(photoInput(`off-${barcode}`), allergens).verdict;
      expect(photo).toBe(barcodeVerdict(barcode, allergens));
    });
  }

  it("the photo confidence of these clear labels is above the threshold", () => {
    for (const b of ["8901058851298", "8901262010016", "3017624010701"]) {
      expect(photoInput(`off-${b}`).ocrConfidence).toBeGreaterThanOrEqual(70);
    }
  });
});

describe("checkLabelText", () => {
  it("a bilingual label is Caution even for a profile the English part doesn't match", () => {
    const r = checkLabelText(photoInput("bilingual"), [p("milk")]);
    expect(r.verdict).toBe("caution");
    expect(r.warnings.map((w) => w.kind)).toContain("low_confidence");
  });

  it("stays Caution after the user deletes the unreadable Hindi lines (confidence is sticky)", () => {
    const input = photoInput("bilingual");
    const edited = { ...input, text: "INGREDIENTS: Wheat flour, sugar, salt, edible vegetable oil." };
    expect(checkLabelText(edited, [p("milk")]).verdict).toBe("caution");
  });

  it("a Hindi-only label is Caution, never Safe", () => {
    expect(checkLabelText(photoInput("hindi"), [p("milk")]).verdict).toBe("caution");
  });

  it("Hindi typed into the box counts as incomplete: Caution", () => {
    const r = checkLabelText({ source: "photo", text: "चीनी, नमक", ocrText: "x", ocrConfidence: 95, textChecked: false }, [p("milk")]);
    expect(r.verdict).toBe("caution");
    expect(r.warnings.map((w) => w.kind)).toContain("incomplete");
  });

  it("low confidence never downgrades Unsafe", () => {
    expect(checkLabelText({ source: "photo", text: "Sugar, milk powder", ocrText: "x", ocrConfidence: 20, textChecked: false }, [p("milk")]).verdict).toBe(
      "unsafe",
    );
  });

  it("a wrapped may-contain line gives Caution, as the same sentence on one line would", () => {
    const r = checkLabelText(photoInput("wrapped"), [p("peanut")]);
    expect(r.verdict).toBe("caution");
    expect(checkAllergens("Sugar, cocoa butter, rice flour. May contain traces of peanuts and sesame.", [p("peanut")]).verdict).toBe(
      "caution",
    );
  });

  it("an edit that adds an allergen makes it Unsafe", () => {
    const input = photoInput("off-8901262010016");
    expect(checkLabelText({ ...input, text: `${input.text} milk` }, [p("milk")]).verdict).toBe("unsafe");
  });
});

describe("checkLabelText: a photo the user ticked as checked against the label", () => {
  const photo = (text: string, ocrConfidence: number, textChecked: boolean): PhotoInput => ({
    source: "photo",
    text,
    ocrText: text,
    ocrConfidence,
    textChecked,
  });

  it("low confidence without the tick stays Caution", () => {
    const r = checkLabelText(photo("Sugar, cocoa butter, salt", 30, false), [p("milk")]);
    expect(r.verdict).toBe("caution");
    expect(r.warnings.map((w) => w.kind)).toEqual(["low_confidence"]);
  });

  it("with the tick, clean text is judged on its own like pasted text: Safe", () => {
    const ticked = checkLabelText(photo("Sugar, cocoa butter, salt", 30, true), [p("milk")]);
    expect(ticked.verdict).toBe("safe");
    expect(ticked.warnings).toEqual([]);
    expect(ticked).toEqual(checkLabelText({ source: "paste", text: "Sugar, cocoa butter, salt" }, [p("milk")]));
  });

  it("the tick removes only the low-confidence reason: Unsafe stays Unsafe", () => {
    expect(checkLabelText(photo("Sugar, whey powder", 10, true), [p("milk")]).verdict).toBe("unsafe");
  });

  it("the tick keeps every other Caution: may contain, a free-from claim, Hindi", () => {
    expect(checkLabelText(photo("Sugar. May contain milk.", 30, true), [p("milk")]).verdict).toBe("caution");
    expect(checkLabelText(photo("Sugar, cocoa. Milk-free.", 30, true), [p("milk")]).verdict).toBe("caution");
    const hindi = checkLabelText(photo("Sugar, दूध", 30, true), [p("milk")]);
    expect(hindi.verdict).toBe("caution");
    expect(hindi.warnings.map((w) => w.kind)).toContain("incomplete");
  });

  it("the tick doesn't matter when the photo was read clearly", () => {
    const a = checkLabelText(photo("Sugar, cocoa butter, salt", 95, false), [p("milk")]);
    expect(a.verdict).toBe("safe");
    expect(checkLabelText(photo("Sugar, cocoa butter, salt", 95, true), [p("milk")])).toEqual(a);
  });
});

// Never weaker: every recorded Unsafe text (labels have no allergen tags, so
// text-only calls) stays Unsafe with the same allergens through the label
// photo path, ticked or not, at any confidence, and through paste.
describe("never weaker: the Unsafe corpus through the label paths", () => {
  type RecordedCall = { text: string | null; allergens: CheckAllergen[]; options: CheckOptions };
  const textOnly = (unsafeCheckCalls as RecordedCall[]).filter(
    (c): c is RecordedCall & { text: string } =>
      typeof c.text === "string" && c.text.trim() !== "" && checkAllergens(c.text, c.allergens).verdict === "unsafe",
  );
  const contains = (r: ReturnType<typeof checkAllergens>) =>
    [...new Set(r.matches.filter((m) => m.kind === "contains").map((m) => m.allergen))].sort();

  it("has cases to check", () => {
    expect(textOnly.length).toBeGreaterThan(20);
  });

  it.each([
    ["photo, not ticked, confidence 5", (text: string) => ({ source: "photo", text, ocrText: text, ocrConfidence: 5, textChecked: false })],
    ["photo, ticked, confidence 5", (text: string) => ({ source: "photo", text, ocrText: text, ocrConfidence: 5, textChecked: true })],
    ["photo, ticked, confidence 99", (text: string) => ({ source: "photo", text, ocrText: text, ocrConfidence: 99, textChecked: true })],
    ["paste", (text: string) => ({ source: "paste", text })],
  ] as [string, (t: string) => LabelCheckInput][])("%s", (_name, make) => {
    for (const c of textOnly) {
      const r = checkLabelText(make(c.text), c.allergens);
      expect(r.verdict, c.text).toBe("unsafe");
      expect(contains(r), c.text).toEqual(contains(checkAllergens(c.text, c.allergens)));
    }
  });
});

describe("checkLabelText: pasted text", () => {
  it("is judged on the text alone: clean text can be Safe", () => {
    const r = checkLabelText({ source: "paste", text: "Sugar, cocoa butter, salt" }, [p("milk")]);
    expect(r.verdict).toBe("safe");
    expect(r.warnings).toEqual([]);
  });

  it("an allergen is Unsafe, a may-contain is Caution", () => {
    expect(checkLabelText({ source: "paste", text: "Sugar, whey" }, [p("milk")]).verdict).toBe("unsafe");
    expect(checkLabelText({ source: "paste", text: "Sugar. May contain milk." }, [p("milk")]).verdict).toBe("caution");
  });

  it("Hindi in pasted text counts as incomplete: Caution", () => {
    expect(checkLabelText({ source: "paste", text: "Sugar, दूध" }, [p("milk")]).verdict).toBe("caution");
  });

  it("gives the same verdict as the barcode for the same ingredients (Maggi, Amul)", () => {
    for (const barcode of ["8901058851298", "8901262010016"]) {
      const product = parseProduct((offProducts as Record<string, unknown>)[barcode]);
      if (!product.found || !product.ingredientsText) throw new Error("fixture");
      for (const profile of Object.values(PROFILES)) {
        expect(checkLabelText({ source: "paste", text: product.ingredientsText }, profile).verdict).toBe(
          barcodeVerdict(barcode, profile),
        );
      }
    }
  });
});

describe("parseLabelCheckInput", () => {
  const ok = { source: "photo", text: "Sugar", ocrText: "Sugar", ocrConfidence: 90, textChecked: false } as const;

  it("accepts a photo: two strings, a number and the tick", () => {
    expect(parseLabelCheckInput(ok)).toEqual({ ok: true, input: ok });
    expect(parseLabelCheckInput({ ...ok, textChecked: true })).toEqual({ ok: true, input: { ...ok, textChecked: true } });
  });

  it("accepts pasted text: one string", () => {
    expect(parseLabelCheckInput({ source: "paste", text: "Sugar" })).toEqual({
      ok: true,
      input: { source: "paste", text: "Sugar" },
    });
  });

  it("asks for pasted text when the box is empty", () => {
    expect(parseLabelCheckInput({ source: "paste", text: " " })).toEqual({
      ok: false,
      error: "There's no text to check. Paste the ingredients first.",
    });
  });

  it.each([
    ["extra field (e.g. an image)", { ...ok, image: "data:image/jpeg;base64,AAAA" }],
    ["a Blob instead of text", { ...ok, text: new Blob(["x"]) }],
    ["confidence as a string", { ...ok, ocrConfidence: "90" }],
    ["confidence above 100", { ...ok, ocrConfidence: 101 }],
    ["confidence NaN", { ...ok, ocrConfidence: Number.NaN }],
    ["the tick as a string", { ...ok, textChecked: "true" }],
    ["no tick field", { source: "photo", text: "Sugar", ocrText: "Sugar", ocrConfidence: 90 }],
    ["paste with a tick", { source: "paste", text: "Sugar", textChecked: true }],
    ["no source", { text: "Sugar", ocrText: "Sugar", ocrConfidence: 90, textChecked: false }],
    ["paste with OCR fields", { ...ok, source: "paste" }],
    ["paste with an image", { source: "paste", text: "Sugar", image: "data:image/jpeg;base64,AAAA" }],
    ["unknown source", { source: "upload", text: "Sugar" }],
    ["not an object", "Sugar"],
    ["null", null],
  ])("rejects %s", (_name, value) => {
    expect(parseLabelCheckInput(value).ok).toBe(false);
  });

  it("rejects empty text with a plain message", () => {
    expect(parseLabelCheckInput({ ...ok, text: "  " })).toEqual({
      ok: false,
      error: "There's no text to check. Type the ingredients or retake the photo.",
    });
  });

  it("rejects text over the column limit instead of clipping it", () => {
    expect(parseLabelCheckInput({ ...ok, text: "a".repeat(20001) }).ok).toBe(false);
  });
});
