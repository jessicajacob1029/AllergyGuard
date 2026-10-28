import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { primaryButtonClass, secondaryButtonClass } from "@/components/form-styles";
import { VerdictView } from "@/components/verdict/verdict-view";
import { APP_NAME } from "@/lib/constants";
import { prepareOcrText } from "@/lib/ocr/prepare-text";
import { readStoredResult } from "@/lib/products/scan-record";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: `Scan result · ${APP_NAME}` };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Shows a saved scan exactly as it was checked (rows are never updated).
export default async function ScanResultPage({ params }: PageProps<"/scans/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(`/login?next=/scans/${id}`);

  // RLS: only the owner's scans are visible, so another user's id is "not found".
  const { data: scan } = await supabase
    .from("scans")
    .select("barcode, input, product_found, product_name, brands, data_notes, result, ocr_text, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!scan) notFound();

  const result = readStoredResult(scan.result);
  if (!result) notFound();

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
        textLabel={photo ? "Text read from your photo" : "Text you pasted"}
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
      product={{ found: scan.product_found, name: scan.product_name, brands: scan.brands, barcode: scan.barcode ?? "" }}
      notes={scan.data_notes ?? []}
      checkedAt={scan.created_at}
      attribution={
        <>
          Product data from{" "}
          <a href="https://world.openfoodfacts.org" className="underline" rel="noopener noreferrer" target="_blank">
            Open Food Facts
          </a>{" "}
          (ODbL).
        </>
      }
      actions={
        <>
          <Link href="/scan" className={primaryButtonClass}>
            Scan another
          </Link>
          <Link href="/" className={secondaryButtonClass}>
            Home
          </Link>
        </>
      }
    />
  );
}
