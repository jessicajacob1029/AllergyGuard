// Measures label OCR on test photos with every combination of the clean-up
// steps in src/lib/ocr/preprocess.ts (Phase 5, step 4). Dev tool only.
//
//   node scripts/measure-ocr.mjs <folder>
//
// <folder>/cases.json lists the photos (kept outside the repo; they may be personal):
//   [{ "file": "IMG_0001.jpg", "crop": [left, top, width, height], "expected": "INGREDIENTS: ..." }]
// "crop" is in pixels of the upright photo (around the ingredients); "expected" is
// the ingredient text as printed. Prints accuracy (1 - edit distance) and the lowest
// line confidence for the old pipeline (whole photo shrunk to 2000 px) and each step
// combination on the crop. Uses sharp (installed with Next.js) to decode photos.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sharp = require("sharp");
const { createWorker } = require("tesseract.js");

// Bundle the app's own preprocess.ts so the measured code is exactly what runs on the phone.
const out = join(mkdtempSync(join(tmpdir(), "measure-ocr-")), "preprocess.cjs");
execFileSync(join(root, "node_modules/.bin/esbuild"), [join(root, "src/lib/ocr/preprocess.ts"), "--bundle", "--format=cjs", `--outfile=${out}`, "--log-level=warning"]);
const { preprocess } = require(out);

const dir = process.argv[2];
if (!dir) throw new Error("usage: node scripts/measure-ocr.mjs <folder with cases.json>");
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

const COMBOS = [
  ["none", {}],
  ["contrast", { contrast: true }],
  ["sharpen (app default)", { sharpen: true }],
  ["threshold", { threshold: true }],
  ["contrast+sharpen", { contrast: true, sharpen: true }],
  ["contrast+threshold", { contrast: true, threshold: true }],
  ["sharpen+threshold (Boost)", { sharpen: true, threshold: true }],
  ["all three", { contrast: true, sharpen: true, threshold: true }],
];

const worker = await createWorker("eng", 1, {
  langPath: join(root, "node_modules/@tesseract.js-data/eng/4.0.0_best_int"),
  cacheMethod: "none",
});
async function read(png, expected) {
  const { data } = await worker.recognize(png, {}, { text: true, blocks: true });
  const lines = (data.blocks ?? [])
    .flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
    .filter((l) => /[\p{L}\p{N}]/u.test(l.text));
  return { acc: accuracy(data.text, expected), low: lines.length ? Math.round(Math.min(...lines.map((l) => l.confidence))) : 0 };
}

const results = {};
for (const c of cases) {
  const file = join(dir, c.file);
  const { info: meta } = await sharp(file).rotate().raw().toBuffer({ resolveWithObject: true });
  const r = (results[c.file] = {});
  const shrunk = await sharp(file).rotate().greyscale().resize({ width: Math.round((meta.width * 2000) / Math.max(meta.width, meta.height)) }).png().toBuffer();
  r["old: whole photo shrunk"] = await read(shrunk, c.expected);
  const [left, top, width, height] = c.crop;
  const { data, info } = await sharp(file).rotate().extract({ left, top, width, height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (const [name, steps] of COMBOS) {
    const g = preprocess(new Uint8ClampedArray(data), info.width, info.height, { contrast: false, sharpen: false, threshold: false, ...steps });
    const png = await sharp(Buffer.from(g.data), { raw: { width: g.width, height: g.height, channels: 1 } }).png().toBuffer();
    r[`crop + ${name}`] = await read(png, c.expected);
  }
}
await worker.terminate();

console.log("accuracy % (lowest line confidence)".padEnd(32) + cases.map((c) => c.file.slice(0, 12).padStart(14)).join("") + "    mean");
for (const row of Object.keys(results[cases[0].file])) {
  const cells = cases.map((c) => results[c.file][row]);
  const mean = cells.reduce((s, x) => s + x.acc, 0) / cells.length;
  console.log(row.padEnd(32) + cells.map((x) => `${Math.round(x.acc * 100)}% (${x.low})`.padStart(14)).join("") + `    ${(mean * 100).toFixed(1)}%`);
}
