import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { primaryButtonClass, secondaryButtonClass, tertiaryButtonClass } from "@/components/form-styles";
import { VerdictView } from "@/components/verdict/verdict-view";
import { APP_NAME } from "@/lib/constants";
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
    .select("barcode, product_found, product_name, brands, data_notes, result, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!scan) notFound();

  const result = readStoredResult(scan.result);
  if (!result) notFound();

  return (
    <VerdictView
      result={result}
      product={{ found: scan.product_found, name: scan.product_name, brands: scan.brands, barcode: scan.barcode }}
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
          <Link href={`/diary/new?scan=${id}`} className={tertiaryButtonClass}>
            Log a reaction to this
          </Link>
        </>
      }
    />
  );
}
