-- Phase 5: label photo scans in the same scans table as barcodes.
--
-- The photo itself is never stored (it stays on the phone). A photo row keeps
-- the text that was checked (ingredients_text, possibly edited by the user),
-- the text Tesseract read (ocr_text) and its confidence. Rows are still never
-- updated; RLS policies are unchanged (select / insert / delete own only).

alter table public.scans
  drop constraint scans_input_check,
  add constraint scans_input_check check (input in ('camera', 'manual', 'photo'));

alter table public.scans alter column barcode drop not null;

alter table public.scans
  add column ocr_text text check (ocr_text is null or char_length(ocr_text) <= 20000),
  add column ocr_confidence real check (ocr_confidence is null or (ocr_confidence >= 0 and ocr_confidence <= 100));

-- A barcode scan has a barcode and no OCR fields; a photo scan the reverse.
alter table public.scans
  add constraint scans_source_check check (
    (input in ('camera', 'manual') and barcode is not null and ocr_text is null and ocr_confidence is null)
    or (input = 'photo' and barcode is null and ocr_text is not null and ocr_confidence is not null
        and product_found = false and ingredients_text is not null)
  );
