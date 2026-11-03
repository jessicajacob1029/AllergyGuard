// Per-line OCR confidence on test photos, read exactly as the app reads them
// (src/lib/ocr/run-ocr.ts): crop at full size, scaleFor(), sharpen, read; if
// the median line is under 20 px, read again enlarged (enlargeScale()) and keep
// the read with the higher page confidence. Dev tool only, for choosing the
// low-confidence threshold and rule (Phase 5, step 4).
//
//   node scripts/measure-ocr-lines.mjs <folder> [--boost] [--json out.json]
//
// <folder>/cases.json (kept outside the repo; photos may be personal or stock):
//   [{ "file": "IMG_0001.jpg", "label": "short name",
//      "crop": [left, top, width, height] | null,   // pixels of the upright photo; null = whole photo
//      "expected": "INGREDIENTS: ..." | null }]      // printed text, for accuracy; null if none/unreadable
//
// Prints each line (confidence, height, text), the app's summary (lowest
// counted line, unclear lines at today's threshold) and the verdict for a
// milk + peanut + wheat profile with and without the "matches the label" tick.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sharp = require("sharp");
const { createWorker } = require("tesseract.js");

// Bundle the app's own code so the measured steps are exactly what runs on the phone.
const tmp = mkdtempSync(join(tmpdir(), "measure-ocr-lines-"));
const entry = join(tmp, "entry.ts");
writeFileSync(
  entry,
  [
    `export { cropToPixels, enlargeScale, scaleFor } from ${JSON.stringify(join(root, "src/lib/ocr/crop.ts"))};`,
    `export { preprocess } from ${JSON.stringify(join(root, "src/lib/ocr/preprocess.ts"))};`,
    `export { summarizeOcr } from ${JSON.stringify(join(root, "src/lib/ocr/summary.ts"))};`,
    `export { prepareOcrText } from ${JSON.stringify(join(root, "src/lib/ocr/prepare-text.ts"))};`,
    `export { checkLabelText } from ${JSON.stringify(join(root, "src/lib/ocr/check-label.ts"))};`,
    `export { DEFAULT_MIN_OCR_CONFIDENCE } from ${JSON.stringify(join(root, "src/lib/allergen/check.ts"))};`,
  ].join("\n"),
);
const bundle = join(tmp, "app.cjs");
execFileSync(join(root, "node_modules/.bin/esbuild"), [
  entry,
  "--bundle",
  "--format=cjs",
  "--platform=node",
  `--tsconfig=${join(root, "tsconfig.json")}`,
  `--outfile=${bundle}`,
  "--log-level=warning",
]);
const app = require(bundle);

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
if (!dir) throw new Error("usage: node scripts/measure-ocr-lines.mjs <folder with cases.json> [--boost] [--json out.json]");
const boost = args.includes("--boost");
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const cases = JSON.parse(readFileSync(join(dir, "cases.json"), "utf8"));

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function lev(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let p = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1));
      p = t;
    }
  }
  return d[b.length];
}
const accuracy = (got, exp) => Math.max(0, 1 - lev(norm(got), norm(exp)) / norm(exp).length);
const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

const PROFILE = [
  { kind: "predefined", code: "milk" },
  { kind: "predefined", code: "peanut" },
  { kind: "predefined", code: "wheat_gluten" },
];

const worker = await createWorker("eng", 1, {
  langPath: join(root, "node_modules/@tesseract.js-data/eng/4.0.0_best_int"),
  cacheMethod: "none",
});

async function read(file, crop, scale) {
  const w = Math.max(1, Math.round(crop.width * scale));
  const h = Math.max(1, Math.round(crop.height * scale));
  const { data, info } = await sharp(file)
    .rotate()
    .extract(crop)
    .resize(w, h, { kernel: "lanczos3" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const g = app.preprocess(new Uint8ClampedArray(data), info.width, info.height, { contrast: false, sharpen: true, threshold: boost });
  const png = await sharp(Buffer.from(g.data), { raw: { width: g.width, height: g.height, channels: 1 } }).png().toBuffer();
  const { data: r } = await worker.recognize(png, {}, { text: true, blocks: true });
  const lines = (r.blocks ?? []).flatMap((b) =>
    b.paragraphs.flatMap((p) => p.lines.map((l) => ({ text: l.text.trim(), confidence: l.confidence, height: l.bbox.y1 - l.bbox.y0 }))),
  );
  return { scale, size: `${w}×${h}`, text: r.text.trim(), lines, page: r.confidence, medianLineHeight: median(lines.map((l) => l.height)) };
}

const report = [];
for (const c of cases) {
  const file = join(dir, c.file);
  const meta = await sharp(file).rotate().metadata();
  const crop = c.crop
    ? { left: c.crop[0], top: c.crop[1], width: c.crop[2], height: c.crop[3] }
    : app.cropToPixels({ x: 0, y: 0, w: 1, h: 1 }, meta.width, meta.height);
  const first = await read(file, crop, app.scaleFor(crop.width, crop.height));
  let kept = first;
  const bigger = app.enlargeScale(first.scale, first.medianLineHeight, crop.width, crop.height);
  let second = null;
  if (bigger !== null) {
    second = await read(file, crop, bigger);
    if (second.page >= first.page) kept = second;
  }
  const summary = app.summarizeOcr(kept.lines);
  const text = app.prepareOcrText(kept.text);
  const verdict = (textChecked) =>
    text.trim() === ""
      ? "(no text)"
      : app.checkLabelText({ source: "photo", text, ocrText: kept.text, ocrConfidence: summary.confidence, textChecked }, PROFILE).verdict;
  const row = {
    label: c.label ?? c.file,
    file: c.file,
    crop: c.crop ? crop : "whole photo",
    reads: [first, second].filter(Boolean).map((r) => ({ size: r.size, page: Math.round(r.page), medianLine: r.medianLineHeight, kept: r === kept })),
    lines: kept.lines.map((l) => ({ conf: Math.round(l.confidence), height: l.height, text: l.text })),
    lowest: summary.confidence,
    unclear: summary.unclearLines.length,
    accuracy: c.expected ? Math.round(accuracy(kept.text, c.expected) * 100) : null,
    verdictNoTick: verdict(false),
    verdictTicked: verdict(true),
    text,
  };
  report.push(row);

  console.log(`\n=== ${row.label}  (${row.crop === "whole photo" ? "whole photo" : `crop ${crop.width}×${crop.height} at ${crop.left},${crop.top}`})`);
  console.log(`reads: ${row.reads.map((r) => `${r.size} page ${r.page} median line ${r.medianLine}px${r.kept ? " (kept)" : ""}`).join("  |  ")}`);
  for (const l of row.lines) console.log(`  ${String(l.conf).padStart(3)}  ${String(l.height).padStart(3)}px  ${l.text}`);
  console.log(
    `lowest counted line ${row.lowest} · unclear (<${app.DEFAULT_MIN_OCR_CONFIDENCE}) ${row.unclear}/${row.lines.length}` +
      (row.accuracy === null ? "" : ` · accuracy ${row.accuracy}%`) +
      ` · verdict (milk+peanut+wheat): ${row.verdictNoTick}, ticked ${row.verdictTicked}`,
  );
}
await worker.terminate();
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2));
