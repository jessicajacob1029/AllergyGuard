-- Phase 5: "Paste text instead". The user pastes ingredient text (e.g. copied
-- from the iPhone Photos app). No photo and no OCR confidence: the text is
-- judged on its own. Rows are still never updated; RLS policies unchanged.

alter table public.scans
  drop constraint scans_input_check,
  add constraint scans_input_check check (input in ('camera', 'manual', 'photo', 'paste'));

alter table public.scans
  drop constraint scans_source_check,
  add constraint scans_source_check check (
    (input in ('camera', 'manual') and barcode is not null and ocr_text is null and ocr_confidence is null)
    or (input = 'photo' and barcode is null and ocr_text is not null and ocr_confidence is not null
        and product_found = false and ingredients_text is not null)
    or (input = 'paste' and barcode is null and ocr_text is null and ocr_confidence is null
        and product_found = false and ingredients_text is not null)
  );
