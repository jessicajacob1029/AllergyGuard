import { describe, expect, it } from "vitest";
import { checkAllergens, type CheckAllergen } from "@/lib/allergen/check";
import type { AllergenCode } from "@/lib/allergen/codes";
import { parseProduct } from "@/lib/products/open-food-facts";
import offProducts from "./__fixtures__/off-products.json";
import ocrSamples from "./__fixtures__/ocr-samples.json";
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
  return { source: "photo", text: prepareOcrText(s.text), ocrText: s.text, ocrConfidence: summarizeOcr(s.lines).confidence };
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
    const r = checkLabelText({ source: "photo", text: "चीनी, नमक", ocrText: "x", ocrConfidence: 95 }, [p("milk")]);
    expect(r.verdict).toBe("caution");
    expect(r.warnings.map((w) => w.kind)).toContain("incomplete");
  });

  it("low confidence never downgrades Unsafe", () => {
    expect(checkLabelText({ source: "photo", text: "Sugar, milk powder", ocrText: "x", ocrConfidence: 20 }, [p("milk")]).verdict).toBe(
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
  const ok = { source: "photo", text: "Sugar", ocrText: "Sugar", ocrConfidence: 90 } as const;

  it("accepts a photo: two strings and a number", () => {
    expect(parseLabelCheckInput(ok)).toEqual({ ok: true, input: ok });
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
    ["no source", { text: "Sugar", ocrText: "Sugar", ocrConfidence: 90 }],
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
