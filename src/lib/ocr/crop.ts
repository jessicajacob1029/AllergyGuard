// Crop box geometry for the label photo (Phase 5). Pure.
// A rect is in fractions (0–1) of the upright photo, so it doesn't depend on
// how big the photo is shown on screen.

export type CropRect = { x: number; y: number; w: number; h: number };
export type Corner = "nw" | "ne" | "sw" | "se";

/** The box the crop step starts with: the middle 80%. */
export const DEFAULT_CROP: CropRect = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };
export const WHOLE_PHOTO: CropRect = { x: 0, y: 0, w: 1, h: 1 };
/** Smallest box side, as a fraction of the photo. */
export const MIN_SIDE = 0.08;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Moves the box by (dx, dy), keeping it inside the photo. */
export function moveRect(r: CropRect, dx: number, dy: number): CropRect {
  return { ...r, x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h) };
}

/** Drags one corner by (dx, dy); the opposite corner stays put. */
export function resizeRect(r: CropRect, corner: Corner, dx: number, dy: number): CropRect {
  let left = r.x;
  let top = r.y;
  let right = r.x + r.w;
  let bottom = r.y + r.h;
  if (corner === "nw" || corner === "sw") left = clamp(left + dx, 0, right - MIN_SIDE);
  else right = clamp(right + dx, left + MIN_SIDE, 1);
  if (corner === "nw" || corner === "ne") top = clamp(top + dy, 0, bottom - MIN_SIDE);
  else bottom = clamp(bottom + dy, top + MIN_SIDE, 1);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** The rect in whole pixels of a width × height image, at least 1 × 1. */
export function cropToPixels(r: CropRect, width: number, height: number) {
  const left = clamp(Math.round(r.x * width), 0, width - 1);
  const top = clamp(Math.round(r.y * height), 0, height - 1);
  const right = clamp(Math.round((r.x + r.w) * width), left + 1, width);
  const bottom = clamp(Math.round((r.y + r.h) * height), top + 1, height);
  return { left, top, width: right - left, height: bottom - top };
}

// Limits for the image given to Tesseract. Never shrink below what's needed:
// only when the crop is bigger than these. 8 MP keeps memory safe on phones
// (canvas + pixel copies) while a 12 MP photo of a label loses little.
export const MAX_SIDE = 4000;
export const MAX_PIXELS = 8_000_000;

/** Scale for a crop: 1 unless it is over the limits. */
export function scaleFor(width: number, height: number): number {
  return Math.min(1, MAX_SIDE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));
}

/** Median line height (px) below which the text is too small for Tesseract. */
export const MIN_LINE_HEIGHT = 20;

/**
 * Scale for a second, enlarged read when the text came out too small, or null
 * if it isn't needed or the limits leave no room. `width` × `height` is the
 * crop at full size; `scale` the one used for the first read.
 */
export function enlargeScale(scale: number, medianLineHeight: number, width: number, height: number): number | null {
  if (medianLineHeight <= 0 || medianLineHeight >= MIN_LINE_HEIGHT) return null;
  const bigger = Math.min(scale * 2, MAX_SIDE / Math.max(width, height), Math.sqrt(MAX_PIXELS / (width * height)));
  return bigger > scale * 1.2 ? bigger : null;
}
