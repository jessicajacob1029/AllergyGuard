import { describe, expect, it } from "vitest";
import { parseVerdictFilter, readScanListRows, VERDICT_FILTERS } from "./scan-list";

describe("parseVerdictFilter", () => {
  it("accepts the three verdicts", () => {
    expect(parseVerdictFilter("safe")).toBe("safe");
    expect(parseVerdictFilter("caution")).toBe("caution");
    expect(parseVerdictFilter("unsafe")).toBe("unsafe");
  });

  it("treats anything else as All", () => {
    for (const v of [undefined, "", "Safe", "all", "dangerous", ["safe", "unsafe"]]) {
      expect(parseVerdictFilter(v)).toBeNull();
    }
  });

  it("lists the filters in display order", () => {
    expect(VERDICT_FILTERS.map((f) => f.label)).toEqual(["All", "Safe", "Caution", "Unsafe"]);
  });
});

describe("readScanListRows", () => {
  const good = {
    id: "a1",
    input: "manual",
    barcode: "8901262010016",
    product_name: "Amul butter",
    brands: "Amul",
    verdict: "unsafe",
    created_at: "2026-10-29T03:20:55Z",
  };

  it("keeps good rows, including photo rows with no barcode or name", () => {
    const photo = { ...good, id: "p1", input: "photo", barcode: null, product_name: null, brands: null, verdict: "caution" };
    expect(readScanListRows([good, photo])).toEqual([good, photo]);
  });

  it("skips rows with a missing id or time, or an unknown verdict", () => {
    expect(readScanListRows([{ ...good, id: 3 }, { ...good, created_at: null }, { ...good, verdict: "maybe" }])).toEqual([]);
  });
});
