// Runs Tesseract.js on a label photo, in the browser only (Phase 5).
// The photo never leaves the device: it is decoded here, cropped, cleaned up
// on a canvas and read by a Web Worker. Tesseract.js is imported only when
// this runs (like @zxing/browser in Phase 4), and its files come from our own
// site (public/tesseract/, copied by scripts/copy-tesseract.mjs), not a CDN.
import { cropToPixels, enlargeScale, scaleFor, WHOLE_PHOTO, type CropRect } from "./crop";
import { readJpegInfo, swapsSides, type JpegInfo } from "./jpeg-info";
import { grayToRgba, preprocess, type PreprocessSteps } from "./preprocess";
import type { OcrLine } from "./summary";

export type OcrProgress =
  /** Downloading / starting the text reader (first time: about 4 MB). */
  | { stage: "loading" }
  /** Reading the photo, 0–1. `pass` 2 is the enlarged second read. */
  | { stage: "reading"; progress: number; pass: 1 | 2 };

/** What happened to the photo before OCR. Shown in the preview-only debug panel. */
export type PhotoInfo = {
  fileType: string;
  fileBytes: number;
  /** EXIF orientation and stored size; null if not a JPEG (e.g. PNG, HEIC). */
  jpeg: JpegInfo | null;
  decoder: "createImageBitmap" | "img";
  /** Size the browser decoded to. */
  decoded: { width: number; height: number };
  /** "browser": already upright; "app": we rotated it (browser ignored EXIF); "not needed". */
  rotation: "browser" | "app" | "not needed";
  /** The crop at full size, in pixels of the upright photo. */
  crop: { left: number; top: number; width: number; height: number };
  steps: PreprocessSteps;
  /** One entry per read: the image size given to Tesseract and the median line height. */
  passes: { width: number; height: number; scale: number; medianLineHeight: number; kept: boolean }[];
};

export type OcrLineDetail = OcrLine & { height: number };

export type OcrOutput = {
  text: string;
  lines: OcrLineDetail[];
  info: PhotoInfo;
  ms: number;
  /** The exact image given to Tesseract for the kept read (JPEG data URL), only when asked for (debug). */
  sentImage: string | null;
};

export type ReadOptions = {
  /** Part of the upright photo to read (fractions). Default: the whole photo. */
  crop?: CropRect;
  /**
   * Add the adaptive threshold ("Boost faded or shiny text"). Measured
   * 2026-10-28: it helps faded and glare photos but loses accuracy on small
   * print and lowers confidence, so it is opt-in. Sharpen is always on.
   */
  boost?: boolean;
  debug?: boolean;
};

// Bump when public/tesseract/lang/eng.traineddata.gz changes, so phones that
// cached the old language data (in IndexedDB) fetch the new one.
const LANG_CACHE_PATH = "allergyguard-ocr-eng-best-int-1";

async function decode(photo: Blob): Promise<{ image: ImageBitmap | HTMLImageElement; decoder: PhotoInfo["decoder"] }> {
  try {
    return { image: await createImageBitmap(photo, { imageOrientation: "from-image" }), decoder: "createImageBitmap" };
  } catch {
    const url = URL.createObjectURL(photo);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { image: img, decoder: "img" };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Canvas transform that displays a stored image upright for EXIF orientation 2–8. */
function applyOrientation(ctx: CanvasRenderingContext2D, orientation: number, w: number, h: number) {
  // w, h: size of the upright (output) canvas.
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, w, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, w, h); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, h); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, w, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, w, h); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, h); break;
  }
}

type Upright = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
  info: Pick<PhotoInfo, "fileType" | "fileBytes" | "jpeg" | "decoder" | "decoded" | "rotation">;
};

/** Decodes the photo the right way up. */
async function decodeUpright(photo: Blob): Promise<Upright> {
  const jpeg =
    photo.type === "image/jpeg" || photo.type === "" ? readJpegInfo(await photo.slice(0, 256 * 1024).arrayBuffer()) : null;
  const { image, decoder } = await decode(photo);
  const dw = "naturalWidth" in image ? image.naturalWidth : image.width;
  const dh = "naturalHeight" in image ? image.naturalHeight : image.height;
  if (!dw || !dh) throw new Error("empty image");
  const release = () => {
    if ("close" in image) image.close();
  };

  // The browser should have applied EXIF orientation. If the decoded size
  // still equals the stored size for an orientation that swaps sides, it
  // didn't: rotate it ourselves so Tesseract never reads text sideways.
  const needsRotation = jpeg !== null && jpeg.orientation !== 1;
  const ignored = needsRotation && swapsSides(jpeg.orientation) && dw === jpeg.width && dh === jpeg.height;
  const base = { fileType: photo.type || "unknown", fileBytes: photo.size, jpeg, decoder, decoded: { width: dw, height: dh } };
  if (!ignored) {
    return { source: image, width: dw, height: dh, release, info: { ...base, rotation: needsRotation ? "browser" : "not needed" } };
  }
  const canvas = document.createElement("canvas");
  canvas.width = dh;
  canvas.height = dw;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  applyOrientation(ctx, jpeg.orientation, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);
  release();
  return { source: canvas, width: dh, height: dw, release: () => {}, info: { ...base, rotation: "app" } };
}

/** The crop, scaled and cleaned up, ready for Tesseract. */
function renderCrop(up: Upright, crop: PhotoInfo["crop"], scale: number, steps: PreprocessSteps): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.width * scale));
  canvas.height = Math.max(1, Math.round(crop.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no canvas");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(up.source, crop.left, crop.top, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const grey = preprocess(pixels.data, canvas.width, canvas.height, steps);
  pixels.data.set(grayToRgba(grey));
  ctx.putImageData(pixels, 0, 0);
  return canvas;
}

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

/**
 * Reads the text on a label photo. The worker is always shut down afterwards
 * (memory on phones), and straight away if `signal` aborts.
 */
export async function readLabelPhoto(
  photo: Blob,
  onProgress: (p: OcrProgress) => void,
  signal?: AbortSignal,
  options: ReadOptions = {},
): Promise<OcrOutput> {
  onProgress({ stage: "loading" });
  const started = performance.now();
  const [up, { createWorker, OEM }] = await Promise.all([decodeUpright(photo), import("tesseract.js")]);
  try {
    signal?.throwIfAborted();
    const crop = cropToPixels(options.crop ?? WHOLE_PHOTO, up.width, up.height);
    const steps: PreprocessSteps = { contrast: false, sharpen: true, threshold: options.boost === true };

    const origin = window.location.origin;
    let pass: 1 | 2 = 1;
    const worker = await createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: `${origin}/tesseract/worker.min.js`,
      workerBlobURL: false,
      corePath: `${origin}/tesseract/core`,
      langPath: `${origin}/tesseract/lang`,
      cachePath: LANG_CACHE_PATH,
      logger: (m) => {
        if (m.status === "recognizing text") onProgress({ stage: "reading", progress: m.progress, pass });
      },
    });
    const stop = () => void worker.terminate();
    signal?.addEventListener("abort", stop, { once: true });
    try {
      const read = async (scale: number) => {
        const canvas = renderCrop(up, crop, scale, steps);
        signal?.throwIfAborted();
        const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
        signal?.throwIfAborted();
        const lines: OcrLineDetail[] = [];
        for (const block of data.blocks ?? []) {
          for (const paragraph of block.paragraphs) {
            for (const line of paragraph.lines) {
              lines.push({ text: line.text.trim(), confidence: line.confidence, height: line.bbox.y1 - line.bbox.y0 });
            }
          }
        }
        return { canvas, scale, text: data.text.trim(), lines, page: data.confidence, medianLineHeight: median(lines.map((l) => l.height)) };
      };

      // Crop first, then scale: full size unless the crop is over the limits.
      const first = await read(scaleFor(crop.width, crop.height));
      let kept = first;
      const bigger = enlargeScale(first.scale, first.medianLineHeight, crop.width, crop.height);
      let second: typeof first | null = null;
      if (bigger !== null) {
        // The text came out too small: read it again enlarged, keep the better read.
        pass = 2;
        second = await read(bigger);
        if (second.page >= first.page) kept = second;
      }
      const passes = [first, second]
        .filter((r): r is typeof first => r !== null)
        .map((r) => ({
          width: r.canvas.width,
          height: r.canvas.height,
          scale: Math.round(r.scale * 1000) / 1000,
          medianLineHeight: r.medianLineHeight,
          kept: r === kept,
        }));

      return {
        text: kept.text,
        lines: kept.lines,
        info: { ...up.info, crop, steps, passes },
        ms: Math.round(performance.now() - started),
        sentImage: options.debug ? kept.canvas.toDataURL("image/jpeg", 0.85) : null,
      };
    } finally {
      signal?.removeEventListener("abort", stop);
      await worker.terminate().catch(() => {});
    }
  } finally {
    up.release();
  }
}
