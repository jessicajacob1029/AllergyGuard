import { describe, expect, it } from "vitest";
import { adaptiveThreshold, grayToRgba, preprocess, sharpen, stretchContrast, toGray, type Gray } from "./preprocess";

const gray = (rows: number[][]): Gray => ({
  data: Uint8ClampedArray.from(rows.flat()),
  width: rows[0].length,
  height: rows.length,
});
const rows = (g: Gray) => Array.from({ length: g.height }, (_, y) => [...g.data.slice(y * g.width, (y + 1) * g.width)]);

describe("toGray", () => {
  it("uses luma weights and ignores alpha", () => {
    const g = toGray(Uint8ClampedArray.from([255, 0, 0, 255, 0, 255, 0, 0, 0, 0, 255, 128, 255, 255, 255, 255]), 4, 1);
    expect([...g.data]).toEqual([76, 150, 29, 255]);
  });
});

describe("stretchContrast", () => {
  it("spreads a dull 100–150 range to 0–255", () => {
    const g = stretchContrast(gray([[100, 110, 120, 150]]), 0, 1);
    expect([...g.data]).toEqual([0, 51, 102, 255]);
  });
  it("leaves a flat image alone", () => {
    const flat = gray([[90, 90, 90]]);
    expect(stretchContrast(flat)).toBe(flat);
  });
});

describe("sharpen", () => {
  it("makes an edge stronger and keeps flat areas the same", () => {
    const g = sharpen(gray([[100, 100, 100, 200, 200, 200]]), 1);
    expect(g.data[0]).toBe(100);
    expect(g.data[2]).toBeLessThan(100);
    expect(g.data[3]).toBeGreaterThan(200 - 1);
    expect(g.data[5]).toBe(200);
  });
});

describe("adaptiveThreshold", () => {
  it("finds dark text on a background that gets darker across the image (a shadow)", () => {
    // Background fades 220 → 120; "text" pixels are 60 darker than their surroundings.
    const width = 40;
    const row = (y: number) =>
      Array.from({ length: width }, (_, x) => 220 - x * 2.5 - (x % 10 === 5 && y === 1 ? 60 : 0));
    const g = adaptiveThreshold(gray([row(0), row(1), row(2)]), 4);
    const text = rows(g)[1];
    for (let x = 0; x < width; x++) expect(text[x], `x=${x}`).toBe(x % 10 === 5 ? 0 : 255);
  });
});

describe("preprocess", () => {
  it("always greyscales, then applies only the chosen steps", () => {
    const rgba = grayToRgba(gray([[100, 150]]));
    expect([...preprocess(rgba, 2, 1, { contrast: false, sharpen: false, threshold: false }).data]).toEqual([100, 150]);
    expect([...preprocess(rgba, 2, 1, { contrast: true, sharpen: false, threshold: false }).data]).toEqual([0, 255]);
  });

  it("grayToRgba is opaque grey", () => {
    expect([...grayToRgba(gray([[7]]))]).toEqual([7, 7, 7, 255]);
  });
});
