"use client";

import { useActionState } from "react";
import { autoWidth, secondaryButtonClass, tertiaryButtonClass } from "@/components/form-styles";
import { BellIcon } from "@/components/ui/icons";
import { setWatching, type WatchActionState } from "@/app/(main)/scans/actions";

type Props = {
  scanId: string;
  watchId: string;
  watching: boolean;
  /** From watchNote(): missing data on Open Food Facts, or too old to re-check. */
  note: string | null;
  /** The account's "Product change alerts" switch. */
  alertsEnabled: boolean;
};

/** "Watching for changes · Stop watching" on a scan result (Phase 8). */
export function WatchControl({ scanId, watchId, watching, note, alertsEnabled }: Props) {
  const [state, action, pending] = useActionState<WatchActionState, FormData>(setWatching, { error: null });
  return (
    <section aria-labelledby="watch-title" className="glass space-y-3 rounded-card p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-band text-primary-ink">
          <BellIcon className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="watch-title" className="text-[15px] font-bold text-ink">
            {watching ? "Watching for changes" : "Not watching this product"}
          </h2>
          <p className="text-sm text-muted">
            {watching
              ? "Every Sunday we re-check this product on Open Food Facts and tell you if it becomes less safe for you."
              : "We won't re-check this product for changes."}
          </p>
          {watching && !alertsEnabled && (
            <p className="mt-1 text-sm text-muted">Product change alerts are off in your profile, so nothing is sent.</p>
          )}
          {note && <p className="mt-2 rounded-[14px] bg-caution-band p-3 text-sm font-bold text-caution-ink">{note}</p>}
        </div>
      </div>
      <form action={action}>
        <input type="hidden" name="scanId" value={scanId} />
        <input type="hidden" name="watchId" value={watchId} />
        <input type="hidden" name="watching" value={watching ? "false" : "true"} />
        <button type="submit" disabled={pending} className={autoWidth(watching ? tertiaryButtonClass : secondaryButtonClass)}>
          {pending ? "Saving…" : watching ? "Stop watching" : "Watch for changes"}
        </button>
      </form>
      {state.error && (
        <p role="alert" className="text-sm font-semibold text-unsafe-ink">
          {state.error}
        </p>
      )}
    </section>
  );
}
