import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { primaryButtonClass, secondaryButtonClass } from "@/components/form-styles";
import { MarkSeen } from "@/components/scans/mark-seen";
import { AlertIcon } from "@/components/ui/icons";
import { LocalTime } from "@/components/ui/local-time";
import { VerdictPill } from "@/components/verdict/verdict-pill";
import { VerdictView } from "@/components/verdict/verdict-view";
import { APP_NAME } from "@/lib/constants";
import { UUID } from "@/lib/products/product-alerts";
import { readStoredResult, SCAN_VERDICTS } from "@/lib/products/scan-record";
import type { Verdict } from "@/lib/allergen/check";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: `Product changed · ${APP_NAME}` };

const isVerdict = (v: unknown): v is Verdict => typeof v === "string" && (SCAN_VERDICTS as readonly string[]).includes(v);

/**
 * Phase 8: a product changed on Open Food Facts and became less safe for the
 * user. Shows what changed, before and after, and the new result in the usual
 * verdict view (explanation, triggers, raw text). Rows are written by the
 * weekly job; RLS shows only the user's own.
 */
export default async function ProductChangePage({ params }: PageProps<"/scans/changes/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(`/login?next=/scans/changes/${id}`);

  const { data: alert } = await supabase
    .from("product_alerts")
    .select("barcode, product_name, brands, old_verdict, new_verdict, summary, result, data_notes, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!alert || !isVerdict(alert.old_verdict) || !isVerdict(alert.new_verdict)) notFound();
  const result = readStoredResult(alert.result);
  if (!result) notFound();

  return (
    <>
      <MarkSeen alertId={id} />
      <VerdictView
        result={result}
        product={{ found: true, name: alert.product_name, brands: alert.brands, barcode: alert.barcode }}
        notes={alert.data_notes ?? []}
        checkedAt={alert.created_at}
        intro={
          <section aria-labelledby="change-title" className="rounded-card border border-caution-ink/20 bg-caution-band p-5">
            <p className="eyebrow flex items-center gap-1.5 text-caution-ink">
              <AlertIcon className="size-4" />
              Product changed
            </p>
            <h1 id="change-title" className="mt-2 text-[19px] font-semibold leading-snug text-ink">
              Open Food Facts {alert.summary}.
            </h1>
            <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>Before</span>
              <VerdictPill verdict={alert.old_verdict} />
              <span aria-hidden="true">→</span>
              <span>Now</span>
              <VerdictPill verdict={alert.new_verdict} />
            </p>
            <p className="mt-3 text-[15px] font-semibold text-ink">
              Open Food Facts is edited by volunteers and can be wrong. Always check the packet before eating.
            </p>
            <p className="mt-2 text-sm text-muted">
              Found on <LocalTime iso={alert.created_at} format="checkedAt" />.
            </p>
          </section>
        }
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
              Scan the packet again
            </Link>
            <Link href="/scans" className={secondaryButtonClass}>
              Scan history
            </Link>
          </>
        }
      />
    </>
  );
}
