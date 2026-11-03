// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A text reader that never becomes ready: what Tesseract.js does when its
// WebAssembly can't start inside the worker (seen with the page CSP, 2026-11-03).
const createWorker = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
vi.mock("tesseract.js", () => ({ createWorker, OEM: { LSTM_ONLY: 1 } }));

import { readLabelPhoto, WORKER_START_TIMEOUT_MS } from "./run-ocr";

const png = () => new Blob(["not really a png"], { type: "image/png" });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 800, height: 600, close: () => {} })));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  createWorker.mockClear();
});

describe("readLabelPhoto: the text reader doesn't start", () => {
  it("gives up after the time limit instead of saying 'Reading…' forever", async () => {
    const result = readLabelPhoto(png(), () => {});
    const settled = expect(result).rejects.toThrow("didn't start in time");
    await vi.advanceTimersByTimeAsync(WORKER_START_TIMEOUT_MS);
    await settled;
    expect(createWorker).toHaveBeenCalledOnce();
  });

  it("stops waiting as soon as the user cancels", async () => {
    const controller = new AbortController();
    const result = readLabelPhoto(png(), () => {}, controller.signal);
    const settled = expect(result).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await settled;
  });

  it("loads the reader only from this site's /tesseract/ files", async () => {
    void readLabelPhoto(png(), () => {}).catch(() => {});
    await vi.advanceTimersByTimeAsync(10);
    const options = (createWorker.mock.calls[0] as unknown[])[2] as Record<string, unknown>;
    const origin = window.location.origin;
    expect(options.workerPath).toBe(`${origin}/tesseract/worker.min.js`);
    expect(options.workerBlobURL).toBe(false);
    expect(options.corePath).toBe(`${origin}/tesseract/core`);
    expect(options.langPath).toBe(`${origin}/tesseract/lang`);
  });
});
