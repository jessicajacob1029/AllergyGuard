import Link from "next/link";
import { BarcodeIcon, CameraIcon, ChevronRightIcon } from "@/components/ui/icons";
import { LocalTime } from "@/components/ui/local-time";
import { VerdictPill } from "@/components/verdict/verdict-pill";
import { scanLabel } from "@/lib/products/scan-label";
import type { ScanListRow } from "@/lib/products/scan-list";

/** One saved scan in a list. The whole row opens the result. */
export function ScanRow({ scan, showTime = false }: { scan: ScanListRow; showTime?: boolean }) {
  const { title, subtitle } = scanLabel(scan);
  const Icon = scan.input === "photo" || scan.input === "paste" ? CameraIcon : BarcodeIcon;
  return (
    <Link
      href={`/scans/${scan.id}`}
      className="grid min-h-[68px] grid-cols-[40px_1fr_auto] items-center gap-3 border-t border-ink/10 py-2.5 text-ink first:border-t-0 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-[12px] bg-band text-primary-ink">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-bold">{title}</span>
        {(subtitle || showTime) && (
          <span className="block truncate text-sm text-muted">
            {subtitle}
            {subtitle && showTime && " · "}
            {showTime && <LocalTime iso={scan.created_at} format="listTime" />}
          </span>
        )}
      </span>
      <span className="flex items-center gap-1">
        <VerdictPill verdict={scan.verdict} />
        <ChevronRightIcon className="size-4 text-muted" />
      </span>
    </Link>
  );
}
