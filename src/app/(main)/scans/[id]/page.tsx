import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { primaryButtonClass, secondaryButtonClass, tertiaryButtonClass } from "@/components/form-styles";
import { StaleResultNotice } from "@/components/scans/stale-result-notice";
import { WatchControl } from "@/components/scans/watch-control";
import { VerdictView } from "@/components/verdict/verdict-view";
import { APP_NAME } from "@/lib/constants";
import { prepareOcrText } from "@/lib/ocr/prepare-text";
import { loadWatch, watchNote } from "@/lib/products/product-alerts";
import { readStoredResult } from "@/lib/products/scan-record";
import { canBeOutOfDate, canRecheck, isOutOfDate, loadAllergiesChangedAt, recheckScan } from "@/lib/products/stale-result";
import { loadAllergens } from "@/lib/profile/load";
import { loadReminderSettings } from "@/lib/reminders/settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: `Scan result · ${APP_NAME}` };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Shows a saved scan. When an allergen was added to the profile after the
// check, a barcode scan is shown with the CURRENT allergies first (checkAllergens()
// again on the saved ingredients: no new lookup, nothing saved) and the saved
// verdict underneath, "At the time of scanning"; ?saved=1 shows the saved result
// instead. A label photo / pasted text that's out of date says "Re-check needed".
export default async function ScanResultPage({ params, searchParams }: PageProps<"/scans/[id]">) {
  const { id } = await params;
  const wantsSaved = (await searchParams).saved === "1";
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(`/login?next=/scans/${id}`);

  // RLS: only the owner's scans are visible, so another user's id is "not found".
  const { data: scan } = await supabase
    .from("scans")
    .select(
      "profile_id, input, barcode, product_found, product_name, brands, ingredients_text, declared_allergens, declared_traces, data_notes, result, ocr_text, text_checked, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!scan) notFound();

  const saved = readStoredResult(scan.result);
  if (!saved) notFound();

  // Allergies added since this check? (A missing product stays Caution whatever the allergies.)
  const outOfDate = canBeOutOfDate(scan) && isOutOfDate(scan.created_at, await loadAllergiesChangedAt(supabase, scan.profile_id));
  const recheckable = outOfDate && canRecheck(scan);
  const rechecked = recheckable && !wantsSaved ? recheckScan(scan, await loadAllergens(supabase, scan.profile_id)) : null;
  const result = rechecked ?? saved;
  const staleMode = !outOfDate ? null : !recheckable ? "recheck_needed" : rechecked ? "current" : "saved";

  // Label photo / pasted text rows (from Phase 5 testing) have no barcode: no product card.
  const fromBarcode = typeof scan.barcode === "string" && scan.barcode !== "";

  // Phase 8: products found by a barcode scan are watched for changes.
  const watch = fromBarcode && scan.product_found ? await loadWatch(supabase, scan.profile_id, scan.barcode) : null;
  const alertsEnabled = watch ? (await loadReminderSettings(supabase, data.claims.sub)).productAlertsEnabled : true;

  const staleNotice = staleMode && (
    <StaleResultNotice
      mode={staleMode}
      checkedAt={scan.created_at}
      savedVerdict={saved.verdict}
      currentHref={`/scans/${id}`}
      savedHref={`/scans/${id}?saved=1`}
    />
  );

  if (scan.input === "photo" || scan.input === "paste") {
    const photo = scan.input === "photo";
    const ocrText = scan.ocr_text ?? "";
    // Shown only when the user changed the text, not for the automatic tidying and line joining.
    const edited = photo && result.rawText !== prepareOcrText(ocrText);
    return (
      <VerdictView
        result={result}
        product={null}
        checkedAt={scan.created_at}
        recheckNeeded={staleMode === "recheck_needed"}
        intro={staleNotice}
        textLabel={photo ? (scan.text_checked ? "Text you checked against the label" : "Text read from your photo") : "Text you pasted"}
        textChecked={photo && scan.text_checked === true}
        notes={photo ? [] : ["Pasted text: make sure it matches the label on the pack."]}
        originalText={edited ? ocrText : null}
        actions={
          <>
            <Link href="/scan/label" className={primaryButtonClass}>
              Check another label
            </Link>
            <Link href="/" className={secondaryButtonClass}>
              Home
            </Link>
          </>
        }
      />
    );
  }

  return (
    <VerdictView
      result={result}
      recheckNeeded={staleMode === "recheck_needed"}
      intro={staleNotice}
      product={
        fromBarcode
          ? { found: scan.product_found, name: scan.product_name, brands: scan.brands, barcode: scan.barcode }
          : null
      }
      notes={scan.data_notes ?? []}
      checkedAt={rechecked ? new Date().toISOString() : scan.created_at}
      attribution={
        fromBarcode && (
          <>
            Product data from{" "}
            <a href="https://world.openfoodfacts.org" className="underline" rel="noopener noreferrer" target="_blank">
              Open Food Facts
            </a>{" "}
            (ODbL).
          </>
        )
      }
      aside={
        watch && (
          <WatchControl
            scanId={id}
            watchId={watch.id}
            watching={watch.watching}
            note={watchNote(watch)}
            alertsEnabled={alertsEnabled}
          />
        )
      }
      actions={
        <>
          <Link href="/scan" className={primaryButtonClass}>
            Scan another
          </Link>
          <Link href="/" className={secondaryButtonClass}>
            Home
          </Link>
          <Link href={`/diary/new?scan=${id}`} className={tertiaryButtonClass}>
            Log a reaction to this
          </Link>
        </>
      }
    />
  );
}
