// Copies the Tesseract.js runtime files from node_modules into public/tesseract/
// so label OCR (Phase 5) is served from our own site, not a third-party CDN.
// Runs before `dev` and `build` (npm pre-scripts). The folder is git-ignored
// and left out of the service-worker precache (see src/app/serwist/[path]/route.ts):
// it is about 15 MB and only needed by people who take a label photo.
//
// Layout (paths used by src/lib/ocr/run-ocr.ts):
//   public/tesseract/worker.min.js
//   public/tesseract/core/tesseract-core-{,simd-,relaxedsimd-}lstm.wasm.js
//   public/tesseract/lang/eng.traineddata.gz

import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "tesseract");
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));

const files = [
  [join(pkgDir("tesseract.js"), "dist", "worker.min.js"), "worker.min.js"],
  // The worker picks one of these per device (OEM LSTM only, the default).
  ...["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"].map(
    (f) => [join(pkgDir("tesseract.js-core"), f), join("core", f)],
  ),
  // "best_int" is the model Tesseract.js uses for LSTM-only by default.
  [join(pkgDir("@tesseract.js-data/eng"), "4.0.0_best_int", "eng.traineddata.gz"), join("lang", "eng.traineddata.gz")],
];

rmSync(out, { recursive: true, force: true });
for (const [from, to] of files) {
  const dest = join(out, to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(from, dest);
}
console.log(`copy-tesseract: ${files.length} files → public/tesseract/`);
