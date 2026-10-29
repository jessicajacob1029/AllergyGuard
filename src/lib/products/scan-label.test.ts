import { describe, expect, it } from "vitest";
import { scanLabel, type ScanLabelRow } from "./scan-label";

const barcodeRow = (over: Partial<ScanLabelRow> = {}): ScanLabelRow => ({
  input: "manual",
  barcode: "8901262010016",
  product_name: "Amul Pasteurized Butter",
  brands: "Amul",
  ...over,
});

describe("scanLabel", () => {
  it("uses the product name as the title and the brand as the subtitle", () => {
    expect(scanLabel(barcodeRow())).toEqual({ title: "Amul Pasteurized Butter", subtitle: "Amul" });
    expect(scanLabel(barcodeRow({ input: "camera" }))).toEqual({ title: "Amul Pasteurized Butter", subtitle: "Amul" });
  });

  it("shows no subtitle when the brand is missing or empty", () => {
    expect(scanLabel(barcodeRow({ brands: null }))).toEqual({ title: "Amul Pasteurized Butter", subtitle: null });
    expect(scanLabel(barcodeRow({ brands: "" }))).toEqual({ title: "Amul Pasteurized Butter", subtitle: null });
  });

  it("calls a barcode scan with no name an unknown product, with its barcode", () => {
    expect(scanLabel(barcodeRow({ product_name: null, brands: null, barcode: "8901719110016" }))).toEqual({
      title: "Unknown product",
      subtitle: "Barcode 8901719110016",
    });
    expect(scanLabel(barcodeRow({ input: "camera", product_name: null, brands: null }))).toEqual({
      title: "Unknown product",
      subtitle: "Barcode 8901262010016",
    });
  });

  it("names label photos and pasted text, with no subtitle", () => {
    const text = { barcode: null, product_name: null, brands: null };
    expect(scanLabel({ input: "photo", ...text })).toEqual({ title: "Label photo", subtitle: null });
    expect(scanLabel({ input: "paste", ...text })).toEqual({ title: "Pasted ingredients", subtitle: null });
  });

  it("never returns 'undefined', 'null' or an empty title", () => {
    const rows: ScanLabelRow[] = [
      barcodeRow(),
      barcodeRow({ brands: null }),
      barcodeRow({ product_name: null, brands: null }),
      { input: "photo", barcode: null, product_name: null, brands: null },
      { input: "paste", barcode: null, product_name: null, brands: null },
    ];
    for (const row of rows) {
      const { title, subtitle } = scanLabel(row);
      expect(title.trim()).not.toBe("");
      expect(`${title} ${subtitle ?? ""}`).not.toMatch(/undefined|null/);
      if (subtitle !== null) expect(subtitle.trim()).not.toBe("");
    }
  });
});
