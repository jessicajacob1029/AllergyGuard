-- Phase 5, decision B changed (2026-11-03): after a label photo was read with
-- low confidence, the user can tick "I've compared this text with the label
-- and it matches." The ticked text is then judged on its own, like pasted text;
-- without the tick, low confidence stays Caution. text_checked records the tick
-- so the result page can say "Based on text you checked".
--
-- Only photo rows can have it. Existing rows get false (nothing was ticked).
-- Rows are still never updated; RLS policies and grants are unchanged (the
-- column is covered by the table-level insert grant to authenticated).

alter table public.scans
  add column text_checked boolean not null default false;

alter table public.scans
  add constraint scans_text_checked_check check (not text_checked or input = 'photo');
