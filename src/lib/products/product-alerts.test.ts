import { describe, expect, it } from "vitest";
import { alertProductLabel, isRecentlyScanned, watchNote, type Watch } from "./product-alerts";

const NOW = new Date("2026-11-03T06:00:00Z");
const watch = (over: Partial<Watch> = {}): Watch => ({
  id: "w1",
  watching: true,
  lastScannedAt: "2026-10-28T10:00:00Z",
  lastCheckedAt: null,
  lastCheckStatus: null,
  ...over,
});

describe("isRecentlyScanned", () => {
  it("covers the last 6 months only", () => {
    expect(isRecentlyScanned("2026-05-04T06:00:00Z", NOW)).toBe(true);
    expect(isRecentlyScanned("2026-05-02T06:00:00Z", NOW)).toBe(false);
  });
});

describe("watchNote", () => {
  it("says nothing for a normal watch, or a stopped one", () => {
    expect(watchNote(watch(), NOW)).toBeNull();
    expect(watchNote(watch({ lastCheckStatus: "unchanged" }), NOW)).toBeNull();
    expect(watchNote(watch({ watching: false, lastCheckStatus: "not_found" }), NOW)).toBeNull();
  });

  it("explains missing data without calling it a change", () => {
    expect(watchNote(watch({ lastCheckStatus: "not_found" }), NOW)).toMatch(/no longer has this product/);
    expect(watchNote(watch({ lastCheckStatus: "no_ingredients" }), NOW)).toMatch(/no ingredient list/);
    expect(watchNote(watch({ lastCheckStatus: "data_incomplete" }), NOW)).toMatch(/may be incomplete/);
  });

  it("says when a product is too old to be re-checked", () => {
    expect(watchNote(watch({ lastScannedAt: "2026-01-01T00:00:00Z" }), NOW)).toMatch(/more than 6 months ago/);
  });
});

describe("alertProductLabel", () => {
  it("falls back to the barcode", () => {
    expect(alertProductLabel({ productName: "Nutella", barcode: "1" })).toBe("Nutella");
    expect(alertProductLabel({ productName: " ", barcode: "3017620422003" })).toBe("Product 3017620422003");
  });
});
