import Link from "next/link";
import { primaryButtonClass } from "@/components/form-styles";
import { ScanRow } from "@/components/scans/scan-row";
import { HeaderBand } from "@/components/ui/header-band";
import type { Verdict } from "@/lib/allergen/check";
import { VERDICT_FILTERS, type ScanListRow } from "@/lib/products/scan-list";

/** How many rows the page shows (newest first). */
export const SCAN_HISTORY_LIMIT = 100;

const EMPTY_FILTERED: Record<Verdict, string> = {
  safe: "No Safe results yet.",
  caution: "No Caution results.",
  unsafe: "No Unsafe results.",
};

/** /scans: every saved check, newest first, with All / Safe / Caution / Unsafe filters. Pure view. */
export function ScanHistoryView({ scans, verdict }: { scans: readonly ScanListRow[]; verdict: Verdict | null }) {
  return (
    <main className="flex flex-1 flex-col">
      <HeaderBand eyebrow="Your activity" title="Scan history" subtitle="Products checked against your profile." />
      <div className="mx-auto w-full max-w-sm space-y-3.5 px-4 pb-6">
        {/* Plain links, so a filtered view works without JavaScript and survives a reload. */}
        <nav aria-label="Filter by verdict">
          <ul className="grid grid-cols-4 gap-1.5">
            {VERDICT_FILTERS.map((f) => {
              const active = f.value === verdict;
              return (
                <li key={f.label}>
                  <Link
                    href={f.value ? `/scans?verdict=${f.value}` : "/scans"}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-11 items-center justify-center rounded-[12px] border px-1 text-[15px] font-semibold max-[359px]:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                      active ? "border-ink bg-ink text-white" : "border-ink/15 bg-white/70 text-ink"
                    }`}
                  >
                    {f.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {scans.length > 0 ? (
          <section aria-label="Scans, newest first" className="glass rounded-card px-4 py-1.5">
            {scans.map((scan) => (
              <ScanRow key={scan.id} scan={scan} showTime />
            ))}
          </section>
        ) : (
          <div className="glass rounded-card p-6 text-center">
            <p className="text-lg font-semibold text-ink">{verdict ? EMPTY_FILTERED[verdict] : "No scans yet"}</p>
            <p className="mt-1 text-[15px] text-muted">
              {verdict ? "Try another filter, or scan a product." : "Products you check will show up here."}
            </p>
            <Link href="/scan" className={`mt-5 ${primaryButtonClass}`}>
              Scan a product
            </Link>
          </div>
        )}

        {scans.length >= SCAN_HISTORY_LIMIT && (
          <p className="text-center text-sm text-muted">Showing your latest {SCAN_HISTORY_LIMIT} scans.</p>
        )}
      </div>
    </main>
  );
}
