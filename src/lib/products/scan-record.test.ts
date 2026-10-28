import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkAllergens } from "@/lib/allergen/check";
import type { Product } from "./open-food-facts";
import { readStoredResult, SCAN_VERDICTS, toLabelScanInsert, toScanInsert } from "./scan-record";

const product: Product = {
  found: true,
  name: "Nutella",
  brands: "Nutella, Ferrero",
  ingredientsText: "sugar, palm oil",
  incomplete: false,
  notes: [],
  declared: { contains: ["milk"], mayContain: ["peanuts"] },
  lastModified: "2026-10-26T00:00:00.000Z",
};

describe("SCAN_VERDICTS", () => {
  it("matches the scan_verdict enum in the migration", () => {
    const dir = join(process.cwd(), "supabase", "migrations");
    const sql = readdirSync(dir)
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");
    const match = sql.match(/create type public\.scan_verdict as enum \(([^)]*)\)/i);
    expect(match).not.toBeNull();
    expect([...match![1].matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([...SCAN_VERDICTS]);
  });
});

describe("toScanInsert", () => {
  it("snapshots the product, the declared allergens and the verdict", () => {
    const result = checkAllergens(product.ingredientsText, [{ kind: "predefined", code: "milk" }], {
      declared: product.declared,
    });
    const row = toScanInsert({ profileId: "p1", barcode: "3017620422003", input: "camera", lookup: product, result });
    expect(row).toMatchObject({
      profile_id: "p1",
      barcode: "3017620422003",
      input: "camera",
      product_found: true,
      product_name: "Nutella",
      ingredients_text: "sugar, palm oil",
      declared_allergens: ["milk"],
      declared_traces: ["peanuts"],
      verdict: "unsafe",
      off_last_modified: "2026-10-26T00:00:00.000Z",
    });
    expect(row.result).toBe(result);
  });

  it("stores a product that wasn't found as Caution with no product data", () => {
    const result = checkAllergens(null, [{ kind: "predefined", code: "milk" }]);
    const row = toScanInsert({ profileId: "p1", barcode: "5000000000000", input: "manual", lookup: { found: false }, result });
    expect(row).toMatchObject({
      product_found: false,
      product_name: null,
      ingredients_text: null,
      declared_allergens: [],
      verdict: "caution",
    });
  });

  it("clips over-long text to the column limits", () => {
    const result = checkAllergens("water", [{ kind: "predefined", code: "milk" }]);
    const row = toScanInsert({
      profileId: "p1",
      barcode: "3017620422003",
      input: "manual",
      lookup: { ...product, name: "x".repeat(900) },
      result,
    });
    expect(row.product_name).toHaveLength(500);
  });
});

describe("toLabelScanInsert", () => {
  it("stores the checked text, the OCR text and confidence, and no product or image data", () => {
    const result = checkAllergens("Sugar, milk powder", [{ kind: "predefined", code: "milk" }], { ocrConfidence: 88 });
    const row = toLabelScanInsert({
      profileId: "p1",
      text: "Sugar, milk powder",
      ocrText: "Sugar, milk\npowder",
      ocrConfidence: 88,
      result,
    });
    expect(row).toEqual({
      profile_id: "p1",
      barcode: null,
      input: "photo",
      product_found: false,
      product_name: null,
      brands: null,
      ingredients_text: "Sugar, milk powder",
      declared_allergens: [],
      declared_traces: [],
      data_notes: [],
      verdict: "unsafe",
      result,
      off_last_modified: null,
      ocr_text: "Sugar, milk\npowder",
      ocr_confidence: 88,
    });
  });

  it("a barcode row has no OCR fields", () => {
    const result = checkAllergens(null, [{ kind: "predefined", code: "milk" }]);
    const row = toScanInsert({ profileId: "p1", barcode: "5000000000000", input: "manual", lookup: { found: false }, result });
    expect(row).toMatchObject({ ocr_text: null, ocr_confidence: null });
  });

  it("the migrations allow photo rows and require their OCR fields", () => {
    const dir = join(process.cwd(), "supabase", "migrations");
    const sql = readFileSync(join(dir, "20261028000000_label_scans.sql"), "utf8");
    expect(sql).toMatch(/input in \('camera', 'manual', 'photo'\)/);
    expect(sql).toMatch(/alter column barcode drop not null/);
    expect(sql).toMatch(/input = 'photo' and barcode is null and ocr_text is not null and ocr_confidence is not null/);
  });
});

describe("readStoredResult", () => {
  it("accepts a stored CheckResult", () => {
    const result = checkAllergens("whey", [{ kind: "predefined", code: "milk" }]);
    expect(readStoredResult(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });

  it.each([null, "unsafe", {}, { verdict: "maybe", explanation: "", rawText: "", matches: [], warnings: [] }])(
    "rejects %j",
    (value) => {
      expect(readStoredResult(value)).toBeNull();
    },
  );
});
