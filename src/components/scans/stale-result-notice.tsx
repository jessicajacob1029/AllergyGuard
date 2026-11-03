import Link from "next/link";
import { autoWidth, linkClass, primaryButtonClass, secondaryButtonClass } from "@/components/form-styles";
import { AlertIcon } from "@/components/ui/icons";
import { LocalTime } from "@/components/ui/local-time";
import { VerdictPill } from "@/components/verdict/verdict-pill";
import type { Verdict } from "@/lib/allergen/check";
import { STALE_WARNING } from "@/lib/products/stale-result";

export type StaleMode =
  /** The page shows the result with the current allergies (the default for barcode scans). */
  | "current"
  /** The page shows the saved result, on request. */
  | "saved"
  /** A label photo / pasted text: can't be re-checked from saved data. */
  | "recheck_needed";

type Props = {
  mode: StaleMode;
  /** When the scan was saved. */
  checkedAt: string;
  /** The verdict saved with the scan. */
  savedVerdict: Verdict;
  /** This scan's page, showing the current result. */
  currentHref: string;
  /** This scan's page, showing the saved result. */
  savedHref: string;
};

function AtTheTime({ checkedAt, savedVerdict }: Pick<Props, "checkedAt" | "savedVerdict">) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
      <span className="font-semibold text-ink">At the time of scanning:</span>
      <VerdictPill verdict={savedVerdict} />
      <span>
        <LocalTime iso={checkedAt} format="checkedAt" />
      </span>
    </p>
  );
}

/**
 * Directly under the verdict of a saved scan when an allergen was added to the
 * profile after the check. Barcode scans show the current verdict first (the
 * page re-runs checkAllergens() on the saved ingredients; nothing is looked up
 * or saved) and the saved one here, "At the time of scanning".
 */
export function StaleResultNotice({ mode, checkedAt, savedVerdict, currentHref, savedHref }: Props) {
  if (mode === "current") {
    return (
      <section aria-labelledby="stale-title" className="rounded-card border border-primary/20 bg-band p-5">
        <h2 id="stale-title" className="text-[17px] font-semibold text-ink">
          Checked with your current allergies
        </h2>
        <p className="mt-1 text-sm text-muted">
          Your allergies have changed since you scanned this. This result uses them with the ingredients saved then;
          the product wasn&apos;t looked up again, so scan the packet for the latest data.
        </p>
        <AtTheTime checkedAt={checkedAt} savedVerdict={savedVerdict} />
        <Link href={savedHref} className={`mt-3 inline-block text-sm ${linkClass}`}>
          Show the result from the time of scanning
        </Link>
      </section>
    );
  }
  return (
    <section role="alert" className="rounded-card border border-caution-ink/20 bg-caution-band p-5">
      <p className="flex items-start gap-2 text-[17px] font-semibold leading-snug text-caution-ink">
        <AlertIcon className="mt-0.5 size-5 shrink-0" />
        {STALE_WARNING}
      </p>
      <AtTheTime checkedAt={checkedAt} savedVerdict={savedVerdict} />
      {mode === "saved" ? (
        <Link href={currentHref} className={`mt-3 ${autoWidth(primaryButtonClass)}`}>
          Show it with my current allergies
        </Link>
      ) : (
        <>
          <p className="mt-2 text-sm text-caution-ink">
            Label photos and pasted ingredients can&apos;t be checked again from saved data. Scan the label again to
            check it with your current allergies.
          </p>
          <Link href="/scan" className={`mt-3 ${autoWidth(secondaryButtonClass)}`}>
            Scan the label again
          </Link>
        </>
      )}
    </section>
  );
}
