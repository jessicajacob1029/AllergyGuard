import Link from "next/link";
import { autoWidth, linkClass, primaryButtonClass } from "@/components/form-styles";
import { AlertIcon } from "@/components/ui/icons";
import { LocalTime } from "@/components/ui/local-time";
import { VerdictPill } from "@/components/verdict/verdict-pill";
import type { Verdict } from "@/lib/allergen/check";
import { STALE_WARNING } from "@/lib/products/stale-result";

type Props = {
  /** When the scan was saved. */
  checkedAt: string;
  /** The verdict saved with the scan. */
  savedVerdict: Verdict;
  /** Set when the page shows the re-checked result. */
  recheckedVerdict: Verdict | null;
  /** Link that re-checks; null when this scan can't be re-checked (label photo, pasted text). */
  recheckHref: string | null;
  /** Back to the saved result. */
  savedHref: string;
};

/**
 * Top of a saved scan result when an allergen was added to the profile after
 * the check: the saved verdict may be out of date. "Re-check" is a plain link
 * (a GET that only reads): the page re-runs checkAllergens() on the saved
 * ingredients and saves nothing.
 */
export function StaleResultNotice({ checkedAt, savedVerdict, recheckedVerdict, recheckHref, savedHref }: Props) {
  if (recheckedVerdict) {
    return (
      <section aria-labelledby="recheck-title" className="rounded-card border border-primary/20 bg-band p-5">
        <h2 id="recheck-title" className="text-[17px] font-semibold text-ink">
          Re-checked with your current allergies
        </h2>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>
            Saved on <LocalTime iso={checkedAt} format="checkedAt" />
          </span>
          <VerdictPill verdict={savedVerdict} />
          <span aria-hidden="true">→</span>
          <span>Now</span>
          <VerdictPill verdict={recheckedVerdict} />
        </p>
        <p className="mt-2 text-sm text-muted">
          From the ingredients saved with the scan. The product wasn&apos;t looked up again, so scan the packet for the
          latest data.
        </p>
        <Link href={savedHref} className={`mt-3 inline-block text-sm ${linkClass}`}>
          Show the saved result
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
      {recheckHref ? (
        <Link href={recheckHref} className={`mt-3 ${autoWidth(primaryButtonClass)}`}>
          Re-check with my current allergies
        </Link>
      ) : (
        <p className="mt-2 text-sm text-caution-ink">Scan the label again to check it with your current allergies.</p>
      )}
    </section>
  );
}
