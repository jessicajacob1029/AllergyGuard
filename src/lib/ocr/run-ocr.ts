// Runs Tesseract.js on a label photo, in the browser only (Phase 5).
// The photo never leaves the device: it is decoded here, shrunk onto a canvas
// and read by a Web Worker. Tesseract.js is imported only when this runs
// (like @zxing/browser in Phase 4), and its files come from our own site
// (public/tesseract/, copied by scripts/copy-tesseract.mjs), not a CDN.
import type { OcrLine } from "./summary";

export type OcrProgress =
  /** Downloading / starting the text reader (first time: about 4 MB). */
  | { stage: "loading" }
  /** Reading the photo, 0–1. */
  | { stage: "reading"; progress: number };

export type OcrOutput = { text: string; lines: OcrLine[] };

// Long side of the image given to Tesseract. iPhone photos are 12–48 MP; the
// full size is slow and can crash a Safari tab, and a label photographed to
// fill the frame is easily readable at this size.
const MAX_SIDE = 2000;

// Bump when public/tesseract/lang/eng.traineddata.gz changes, so phones that
// cached the old language data (in IndexedDB) fetch the new one.
const LANG_CACHE_PATH = "allergyguard-ocr-eng-best-int-1";

async function decode(photo: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // Applies the photo's EXIF rotation, so a portrait photo isn't read sideways.
    return await createImageBitmap(photo, { imageOrientation: "from-image" });
  } catch {
    // Older Safari: fall back to an <img> (which also applies EXIF rotation).
    const url = URL.createObjectURL(photo);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Shrinks the photo to at most MAX_SIDE pixels and makes it greyscale. */
export async function preparePhoto(photo: Blob): Promise<HTMLCanvasElement> {
  const image = await decode(photo);
  const width = "naturalWidth" in image ? image.naturalWidth : image.width;
  const height = "naturalHeight" in image ? image.naturalHeight : image.height;
  if (!width || !height) throw new Error("empty image");
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.filter = "grayscale(1)";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  if ("close" in image) image.close();
  return canvas;
}

/**
 * Reads the text on a label photo. The worker is always shut down afterwards
 * (memory on phones), and straight away if `signal` aborts.
 */
export async function readLabelPhoto(
  photo: Blob,
  onProgress: (p: OcrProgress) => void,
  signal?: AbortSignal,
): Promise<OcrOutput> {
  onProgress({ stage: "loading" });
  const [canvas, { createWorker, OEM }] = await Promise.all([preparePhoto(photo), import("tesseract.js")]);
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
    const lines: OcrLine[] = [];
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs) {
        for (const line of paragraph.lines) lines.push({ text: line.text.trim(), confidence: line.confidence });
      }
    }
    return { text: data.text.trim(), lines };
  } finally {
    signal?.removeEventListener("abort", stop);
    await worker.terminate().catch(() => {});
  }
}
