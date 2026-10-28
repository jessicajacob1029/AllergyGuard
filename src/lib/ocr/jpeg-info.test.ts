import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readJpegInfo, swapsSides } from "./jpeg-info";

const fixture = (name: string) => {
  const b = readFileSync(join(__dirname, "__fixtures__", name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe("readJpegInfo", () => {
  it("reads Orientation 6 and the stored size (like an iPhone portrait photo)", () => {
    expect(readJpegInfo(fixture("tiny-8x4-orientation6.jpg"))).toEqual({ orientation: 6, width: 8, height: 4 });
  });

  it("defaults to orientation 1 without EXIF", () => {
    expect(readJpegInfo(fixture("tiny-8x4-no-exif.jpg"))).toEqual({ orientation: 1, width: 8, height: 4 });
  });

  it("returns null for anything that isn't a JPEG", () => {
    expect(readJpegInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull();
    expect(readJpegInfo(new ArrayBuffer(0))).toBeNull();
    expect(readJpegInfo(new Uint8Array([0xff, 0xd8, 0x00]).buffer)).toBeNull();
  });
});

describe("swapsSides", () => {
  it.each([
    [1, false],
    [3, false],
    [5, true],
    [6, true],
    [8, true],
  ])("orientation %i → %s", (o, expected) => {
    expect(swapsSides(o)).toBe(expected);
  });
});
