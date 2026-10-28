import { describe, expect, it } from "vitest";
import { cropToPixels, DEFAULT_CROP, enlargeScale, MIN_SIDE, moveRect, resizeRect, scaleFor } from "./crop";

const near = (a: object, b: object) => {
  for (const [k, v] of Object.entries(b)) expect((a as Record<string, number>)[k], k).toBeCloseTo(v as number, 6);
};

describe("moveRect", () => {
  it("moves the box", () => near(moveRect(DEFAULT_CROP, 0.05, -0.05), { x: 0.15, y: 0.05, w: 0.8, h: 0.8 }));
  it("keeps it inside the photo", () => near(moveRect(DEFAULT_CROP, 0.5, -0.5), { x: 0.2, y: 0, w: 0.8, h: 0.8 }));
});

describe("resizeRect", () => {
  it("drags the bottom-right corner, top-left stays", () =>
    near(resizeRect(DEFAULT_CROP, "se", -0.3, -0.4), { x: 0.1, y: 0.1, w: 0.5, h: 0.4 }));
  it("drags the top-left corner, bottom-right stays", () =>
    near(resizeRect(DEFAULT_CROP, "nw", 0.2, 0.3), { x: 0.3, y: 0.4, w: 0.6, h: 0.5 }));
  it("never goes outside the photo", () =>
    near(resizeRect(DEFAULT_CROP, "ne", 0.5, -0.5), { x: 0.1, y: 0, w: 0.9, h: 0.9 }));
  it("never gets smaller than the minimum side", () => {
    const r = resizeRect(DEFAULT_CROP, "sw", 2, -2);
    expect(r.w).toBeCloseTo(MIN_SIDE, 6);
    expect(r.h).toBeCloseTo(MIN_SIDE, 6);
  });
});

describe("cropToPixels", () => {
  it("converts fractions to whole pixels", () => {
    expect(cropToPixels({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 4032, 3024)).toEqual({
      left: 1008,
      top: 1512,
      width: 2016,
      height: 756,
    });
  });
  it("is always at least 1×1 and inside the image", () => {
    expect(cropToPixels({ x: 1, y: 1, w: 0, h: 0 }, 10, 10)).toEqual({ left: 9, top: 9, width: 1, height: 1 });
  });
});

describe("scaleFor: only shrink when bigger than needed", () => {
  it("keeps an ingredients crop at full size", () => expect(scaleFor(1800, 1200)).toBe(1));
  it("shrinks a whole 12 MP photo to 8 MP", () => {
    const s = scaleFor(4032, 3024);
    expect(4032 * s * 3024 * s).toBeCloseTo(8_000_000, -3);
  });
  it("keeps the longest side at most 4000", () => expect(scaleFor(8000, 500) * 8000).toBeCloseTo(4000, 6));
});

describe("enlargeScale: a second read when the text is too small", () => {
  it("doubles a small crop whose lines are under 20 px", () => expect(enlargeScale(1, 14, 900, 600)).toBe(2));
  it("not needed when lines are tall enough", () => expect(enlargeScale(1, 32, 900, 600)).toBeNull());
  it("not when no lines were found", () => expect(enlargeScale(1, 0, 900, 600)).toBeNull());
  it("not when the limits leave no room", () => expect(enlargeScale(scaleFor(4032, 3024), 12, 4032, 3024)).toBeNull());
  it("partly, up to the pixel limit", () => {
    const s = enlargeScale(1, 12, 2400, 2000)!;
    expect(s).toBeGreaterThan(1.2);
    expect(2400 * s * 2000 * s).toBeLessThanOrEqual(8_000_001);
  });
});
