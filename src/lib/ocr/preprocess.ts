// Image clean-up before OCR (Phase 5). Pure functions on pixel arrays, so the
// same code runs in the browser (canvas ImageData) and in Node (the
// measurement script). Which steps are switched on is decided by measuring
// (see docs/PROGRESS.md "Phase 5"), not by guessing.

/** One grey value (0–255) per pixel. */
export type Gray = { data: Uint8ClampedArray; width: number; height: number };

export type PreprocessSteps = {
  /** Stretch the 1st–99th percentile of brightness to full black–white. */
  contrast: boolean;
  /** Light unsharp mask (3×3). */
  sharpen: boolean;
  /** Adaptive (local mean) threshold to pure black and white. */
  threshold: boolean;
};

/** RGBA → grey (Rec. 601 luma). Always the first step. */
export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Gray {
  const data = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; j < data.length; i += 4, j++) {
    data[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }
  return { data, width, height };
}

export function stretchContrast(g: Gray, low = 0.01, high = 0.99): Gray {
  const hist = new Uint32Array(256);
  for (const v of g.data) hist[v]++;
  const n = g.data.length;
  let lo = 0;
  let hi = 255;
  for (let acc = 0, v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc > n * low) {
      lo = v;
      break;
    }
  }
  for (let acc = 0, v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc > n * (1 - high)) {
      hi = v;
      break;
    }
  }
  if (hi <= lo) return g;
  const scale = 255 / (hi - lo);
  const data = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) data[i] = (g.data[i] - lo) * scale;
  return { data, width: g.width, height: g.height };
}

/**
 * Summed-area table for fast box means. 32-bit to halve memory on phones:
 * the largest sum is 255 × pixels, which fits for up to 16.8 MP (the OCR
 * image is at most 8 MP, see MAX_PIXELS in crop.ts).
 */
function integral(g: Gray): Uint32Array {
  const { width: w, height: h, data } = g;
  const s = new Uint32Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) {
      row += data[(y - 1) * w + (x - 1)];
      s[y * (w + 1) + x] = s[(y - 1) * (w + 1) + x] + row;
    }
  }
  return s;
}

function boxMean(s: Uint32Array, w: number, h: number, x: number, y: number, r: number): number {
  const x0 = Math.max(0, x - r);
  const y0 = Math.max(0, y - r);
  const x1 = Math.min(w, x + r + 1);
  const y1 = Math.min(h, y + r + 1);
  const W = w + 1;
  const sum = s[y1 * W + x1] - s[y0 * W + x1] - s[y1 * W + x0] + s[y0 * W + x0];
  return sum / ((x1 - x0) * (y1 - y0));
}

export function sharpen(g: Gray, amount = 0.6): Gray {
  const { width: w, height: h } = g;
  const s = integral(g);
  const data = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = g.data[y * w + x];
      data[y * w + x] = v + amount * (v - boxMean(s, w, h, x, y, 1));
    }
  }
  return { data, width: w, height: h };
}

/**
 * Bradley-style adaptive threshold: a pixel darker than its neighbourhood
 * mean by more than `k` becomes black. Copes with shadows and shine that a
 * single global threshold (Tesseract's own) gets wrong.
 */
export function adaptiveThreshold(g: Gray, radius?: number, k = 0.15): Gray {
  const { width: w, height: h } = g;
  const r = radius ?? Math.max(7, Math.round(Math.max(w, h) / 48));
  const s = integral(g);
  const data = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      data[y * w + x] = g.data[y * w + x] < boxMean(s, w, h, x, y, r) * (1 - k) ? 0 : 255;
    }
  }
  return { data, width: w, height: h };
}

export function grayToRgba(g: Gray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(g.data.length * 4);
  for (let i = 0, j = 0; i < g.data.length; i++, j += 4) {
    out[j] = out[j + 1] = out[j + 2] = g.data[i];
    out[j + 3] = 255;
  }
  return out;
}

/** Greyscale, then the chosen steps in a fixed order: contrast → sharpen → threshold. */
export function preprocess(rgba: Uint8ClampedArray, width: number, height: number, steps: PreprocessSteps): Gray {
  let g = toGray(rgba, width, height);
  if (steps.contrast) g = stretchContrast(g);
  if (steps.sharpen) g = sharpen(g);
  if (steps.threshold) g = adaptiveThreshold(g);
  return g;
}
