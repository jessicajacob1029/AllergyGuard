import Link from "next/link";
import { BarcodeIcon, CameraIcon, ChevronRightIcon } from "@/components/ui/icons";
import { LocalTime } from "@/components/ui/local-time";
import { RecheckNeededPill, VerdictPill } from "@/components/verdict/verdict-pill";
import { scanLabel } from "@/lib/products/scan-label";
import type { ScanListRow } from "@/lib/products/scan-list";
import type { CurrentVerdict } from "@/lib/products/stale-result";

const WORD = { safe: "Safe", caution: "Caution", unsafe: "Unsafe" } as const;

/**
 * One saved scan in a list. The whole row opens the result. Names may wrap to
 * two lines and the brand / barcode line is never cut off. On narrow phones
 * (under 360px) the verdict moves under the text so the name keeps its width.
 */
export function ScanRow({
  scan,
  showTime = false,
  changed = false,
  current,
}: {
  scan: ScanListRow;
  showTime?: boolean;
  /** Phase 8: Open Food Facts changed this product since (an unseen alert). */
  changed?: boolean;
  /**
   * The verdict to show today (currentVerdict()). When an allergen was added
   * after the check, the pill is the re-checked verdict and a note says what it
   * was when scanned. Without it, the saved verdict is shown.
   */
  current?: CurrentVerdict;
}) {
  const { title, subtitle } = scanLabel(scan);
  const shown = current?.shown ?? scan.verdict;
  const pill = shown === "recheck_needed" ? <RecheckNeededPill /> : <VerdictPill verdict={shown} />;
  const wasDifferent = current?.outOfDate && current.shown !== current.saved;
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
        <span className="line-clamp-2 break-words text-[15px] font-bold leading-snug">{title}</span>
        {subtitle && <span className="block break-words text-sm text-muted">{subtitle}</span>}
        {wasDifferent && current && (
          <span className="mt-1 mr-1.5 inline-flex rounded-[8px] bg-[#ece8ef] px-2 py-0.5 text-xs font-bold text-[#4f4a55]">
            Was {WORD[current.saved]} when scanned
          </span>
        )}
        {changed && (
          <span className="mt-1 inline-flex rounded-[8px] bg-caution-band px-2 py-0.5 text-xs font-bold text-caution-ink">
            Changed since
          </span>
        )}
        {showTime && (
          <span className="block text-sm text-muted">
            <LocalTime iso={scan.created_at} format="listTime" />
          </span>
        )}
        <span className="mt-1.5 hidden max-[359px]:flex">{pill}</span>
      </span>
      <span className="flex items-center gap-1">
        <span className="max-[359px]:hidden">{pill}</span>
        <ChevronRightIcon className="size-4 text-muted" />
      </span>
    </Link>
  );
}
