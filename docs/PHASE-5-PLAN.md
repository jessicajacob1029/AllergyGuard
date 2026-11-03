# Phase 5: finishing label photo OCR (2026-11-03)

Plan approved by the user on 2026-11-03. Earlier rounds (build, first iPhone test, crop/sharpen/Boost/Paste) are in
`docs/PROGRESS.md` under "Phase 5".

## Decisions

- **Merge** the fork's `main` into `phase-5` (redesign v2, Google login, desktop layout, Phases 6–8, security
  fixes). The two Phase 5 migrations were already live and were not run again.
- **Screens** restyled in v2 for phone and desktop. On desktop the review step shows the cropped photo beside the
  text; on phones it is folded under "Show my photo".
- **CSP:** the Tesseract.js worker follows the policy sent with its own script. `/tesseract/*` skips the proxy and
  gets `OCR_WORKER_CSP`: `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'`. Pages get
  nothing new: no `'wasm-unsafe-eval'`, no `blob:`.
- **Decision B changed:** after a low-confidence read, the user can tick **"I've compared this text with the label
  and it matches."**
  - It is shown only when confidence is low, starts unticked, and any edit or new read clears it.
  - Ticked text is judged on its own like pasted text: only the low-confidence reason goes.
  - Unsafe, may-contain, free-from claims and Hindi stay as they were.
  - The result says "Based on text you checked"; "Always read the label" stays.
  - Saved as `scans.text_checked` (migration `20261103010000_text_checked.sql`, **run by the user in the SQL
    Editor**). Only photo rows write the column, so barcode and paste saves work before the migration too.
- **Phase 8:** photo and paste scans are never watched. When allergies change they show "Re-check needed"
  (ticked or not).
- **Clean-up:** the debug panel is removed. The Privacy page's "Label photos and pasted text" section is in the
  present tense.

## Found and fixed on the way

- With the page policy, the worker couldn't compile its WebAssembly, so OCR could never start on production.
  Tesseract.js then never settled `createWorker()`, and the screen said "Reading…" forever. Now it gives up after
  2 minutes with the usual "couldn't read" message, and Cancel stops the wait.

## Confidence measurements (step 4)

Tool: `node scripts/measure-ocr-lines.mjs ~/AllergyGuard-photos`. It runs the app's own crop, scale, sharpen,
enlarged re-read, `summarizeOcr()` and `checkLabelText()`. The verdicts are for a milk + peanut + wheat profile at
today's threshold of 70.

**Web images (hard cases, 100–670 px; not used alone to set the threshold):**

| Photo | Area read | Real lines | Junk lines | Lowest | Accuracy | Verdict | Ticked |
|---|---|---|---|---|---|---|---|
| 1 Nutrition panel, no ingredients | whole | 40–94 (mixed panels) | 17–49 | 17 | n/a | Caution | Caution (was **Safe**) |
| 2 Walkers, ingredients + allergy box | crop | 65–96 | none | 65 | 99% | **Unsafe** (should be Caution) | Unsafe |
| 2 Walkers | whole | 30–96 | 30–49 | 30 | n/a | Caution (was Unsafe) | Caution |
| 3 Ojas, ingredients (white on black) | crop, re-read ×2 | 77–91 | none | 77 | 99% | Safe | Safe |
| 3 Ojas, Hindi heading | whole, re-read ×2 | 30–94 | 24 (Hindi) | 24 | n/a | Caution | Safe |
| 4 Corn chips, milk powder | crop, re-read ×2 | 72–96 | 9–13 (border) | 13 | 90% | Unsafe | Unsafe |
| 4 Corn chips | whole, re-read ×2 | 74–96 | 21–46 | 21 | n/a | Unsafe | Unsafe |
| 5 Tiny blurry (104×216) | crop | none | 31, 96 ("=") | 0 | n/a | Caution | Caution |

**Real phone photos:** waiting for the user's photos in `~/AllergyGuard-photos`. The threshold and rule come
mainly from those.

Verdicts updated 2026-11-04, after the two rules below.

## Decided 2026-11-04

- **No ingredients list is never Safe.**
  - **Photo:** no "ingredients", "contains" or "सामग्री" heading (any case) → incomplete, Caution, with "We
    couldn't find an ingredients list. Check the label."
  - **Paste:** fewer than 2 items or 10 letters → incomplete ("This doesn't look like a full ingredients list.
    Check the label."). Text with no letters at all (e.g. "1") was already Caution ("No ingredient list was
    found"). Correction: on 2026-11-03 I wrote that pasting "1" gave Safe; it never did.
  - The tick never overrides incomplete.
- **`joinOcrLines()` joins a line ending with ":" to the next one**, never across a blank line. "Made in a factory
  that also handles:⏎Milk, Wheat" is Caution. The never-weaker corpus passes, also with a line break after every
  colon (only 6 corpus texts have a colon).
  - **Still open:** in the cropped Walkers read, Tesseract left a blank line after "handles:", so it is still
    Unsafe. Allowing a colon to join across one blank line would fix it.

## Open questions for the user (2026-11-03)

1. **The threshold and rule** (the user writes it in `summarizeOcr()`), after the phone photos are measured.
2. **No ingredients list → Safe.**
   - A nutrition panel with no ingredients list gives Safe when read clearly or ticked. Pasting "1" also gives Safe.
   - Rule: missing data is never Safe.
   - Idea: treat text with no "ingredients" or "contains" heading (or very few letters) as incomplete, so it is
     Caution.
3. **"Made in a factory that also handles:" on its own line.** Tesseract puts the list ("Milk, Wheat…") in the
   next paragraph, so it counts as real ingredients: Unsafe instead of Caution. This errs on the cautious side.
   A fix would touch `joinOcrLines()` or the shared-facility rule in `checkAllergens()` (Phase 3 code).
