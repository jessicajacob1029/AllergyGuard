import Link from "next/link";
import { AlertIcon, ChevronRightIcon } from "@/components/ui/icons";
import { VerdictPill } from "@/components/verdict/verdict-pill";
import { alertProductLabel, type AlertListItem } from "@/lib/products/product-alerts";

/** Top of Scan history: products that changed since you scanned them, until you open each one. */
export function ChangedProductsBanner({ alerts }: { alerts: readonly AlertListItem[] }) {
  if (alerts.length === 0) return null;
  const heading =
    alerts.length === 1 ? "1 product you scanned has changed" : `${alerts.length} products you scanned have changed`;
  return (
    <section aria-labelledby="changed-title" className="rounded-card border border-caution-ink/20 bg-caution-band p-4">
      <h2 id="changed-title" className="flex items-center gap-2 text-[15px] font-bold text-caution-ink">
        <AlertIcon className="size-5 shrink-0" />
        {heading}
      </h2>
      <ul className="mt-2 space-y-1">
        {alerts.map((a) => (
          <li key={a.id}>
            <Link
              href={`/scans/changes/${a.id}`}
              className="grid min-h-11 grid-cols-[1fr_auto] items-center gap-3 rounded-[12px] bg-white/70 px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="min-w-0">
                <span className="block break-words text-[15px] font-bold">{alertProductLabel(a)}</span>
                <span className="block break-words text-sm text-muted">Open Food Facts {a.summary}.</span>
              </span>
              <span className="flex items-center gap-1">
                <VerdictPill verdict={a.newVerdict} />
                <ChevronRightIcon className="size-4 text-muted" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
