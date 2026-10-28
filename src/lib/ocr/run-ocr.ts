// Runs Tesseract.js on a label photo, in the browser only (Phase 5).
// The photo never leaves the device: it is decoded here, shrunk onto a canvas
// and read by a Web Worker. Tesseract.js is imported only when this runs
// (like @zxing/browser in Phase 4), and its files come from our own site
// (public/tesseract/, copied by scripts/copy-tesseract.mjs), not a CDN.
import { readJpegInfo, swapsSides, type JpegInfo } from "./jpeg-info";
import type { OcrLine } from "./summary";

export type OcrProgress =
  /** Downloading / starting the text reader (first time: about 4 MB). */
  | { stage: "loading" }
  /** Reading the photo, 0–1. */
  | { stage: "reading"; progress: number };

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
  /** Size of the image given to Tesseract. */
  sent: { width: number; height: number };
  scale: number;
};

export type OcrLineDetail = OcrLine & { height: number };

export type OcrOutput = {
  text: string;
  lines: OcrLineDetail[];
  info: PhotoInfo;
  ms: number;
  /** The exact image given to Tesseract (JPEG data URL), only when asked for (debug). */
  sentImage: string | null;
};

// Long side of the image given to Tesseract. iPhone photos are 12–48 MP; the
// full size is slow and can crash a Safari tab.
const MAX_SIDE = 2000;

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

/** Upright, shrunk to at most MAX_SIDE, greyscale. */
export async function preparePhoto(photo: Blob): Promise<{ canvas: HTMLCanvasElement; info: PhotoInfo }> {
  const jpeg = photo.type === "image/jpeg" || photo.type === "" ? readJpegInfo(await photo.slice(0, 256 * 1024).arrayBuffer()) : null;
  const { image, decoder } = await decode(photo);
  const dw = "naturalWidth" in image ? image.naturalWidth : image.width;
  const dh = "naturalHeight" in image ? image.naturalHeight : image.height;
  if (!dw || !dh) throw new Error("empty image");

  // The browser should have applied EXIF orientation. If the decoded size
  // still equals the stored size for an orientation that swaps sides, it
  // didn't: rotate it ourselves so Tesseract never reads text sideways.
  const needsRotation = jpeg !== null && jpeg.orientation !== 1;
  const browserIgnoredExif = needsRotation && swapsSides(jpeg.orientation) && dw === jpeg.width && dh === jpeg.height;
  const rotation: PhotoInfo["rotation"] = !needsRotation ? "not needed" : browserIgnoredExif ? "app" : "browser";
  const uprightW = browserIgnoredExif ? dh : dw;
  const uprightH = browserIgnoredExif ? dw : dh;

  const scale = Math.min(1, MAX_SIDE / Math.max(uprightW, uprightH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(uprightW * scale);
  canvas.height = Math.round(uprightH * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.filter = "grayscale(1)";
  if (browserIgnoredExif) {
    applyOrientation(ctx, jpeg.orientation, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.height, canvas.width);
  } else {
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  }
  if ("close" in image) image.close();

  return {
    canvas,
    info: {
      fileType: photo.type || "unknown",
      fileBytes: photo.size,
      jpeg,
      decoder,
      decoded: { width: dw, height: dh },
      rotation,
      sent: { width: canvas.width, height: canvas.height },
      scale: Math.round(scale * 1000) / 1000,
    },
  };
}

/**
 * Reads the text on a label photo. The worker is always shut down afterwards
 * (memory on phones), and straight away if `signal` aborts.
 */
export async function readLabelPhoto(
  photo: Blob,
  onProgress: (p: OcrProgress) => void,
  signal?: AbortSignal,
  options: { debug?: boolean } = {},
): Promise<OcrOutput> {
  onProgress({ stage: "loading" });
  const started = performance.now();
  const [{ canvas, info }, { createWorker, OEM }] = await Promise.all([preparePhoto(photo), import("tesseract.js")]);
  signal?.throwIfAborted();

  const origin = window.location.origin;
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: `${origin}/tesseract/worker.min.js`,
    workerBlobURL: false,
    corePath: `${origin}/tesseract/core`,
    langPath: `${origin}/tesseract/lang`,
    cachePath: LANG_CACHE_PATH,
    logger: (m) => {
      if (m.status === "recognizing text") onProgress({ stage: "reading", progress: m.progress });
    },
  });
  const stop = () => void worker.terminate();
  signal?.addEventListener("abort", stop, { once: true });
  try {
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
    return {
      text: data.text.trim(),
      lines,
      info,
      ms: Math.round(performance.now() - started),
      sentImage: options.debug ? canvas.toDataURL("image/jpeg", 0.85) : null,
    };
  } finally {
    signal?.removeEventListener("abort", stop);
    await worker.terminate().catch(() => {});
  }
}
