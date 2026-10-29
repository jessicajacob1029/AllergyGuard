"use client";

import { useState, useTransition } from "react";
import { formAlertClass, tertiaryButtonClass } from "@/components/form-styles";
import { deleteReaction } from "./actions";

// Two separate class strings: mixing bg/text classes on one element lets the
// wrong one win (red text on the red confirm button).
const dangerBase =
  "flex min-h-[52px] w-full items-center justify-center rounded-button border-2 border-unsafe-ink px-4 " +
  "text-base font-extrabold uppercase tracking-wide disabled:opacity-60 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const dangerButtonClass = `${dangerBase} bg-card text-unsafe-ink`;
const dangerConfirmClass = `${dangerBase} bg-unsafe-ink text-card`;

/** Delete, with a confirm step in the page (no browser pop-up). */
export function DeleteReaction({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={dangerButtonClass}>
        Delete reaction
      </button>
    );
  }

  return (
    <div role="group" aria-labelledby="delete-confirm" className="space-y-3 rounded-card border border-unsafe-ink/30 bg-unsafe-band p-4">
      <p id="delete-confirm" className="text-base font-extrabold text-unsafe-ink">
        Delete this reaction? This can&apos;t be undone.
      </p>
      {error && (
        <p role="alert" className={formAlertClass}>
          {error}
        </p>
      )}
      <button
        type="button"
        autoFocus
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            // On success the Server Function redirects to the diary.
            const result = await deleteReaction(id);
            if (result?.error) setError(result.error);
          })
        }
        className={dangerConfirmClass}
      >
        {pending ? "Deleting…" : "Yes, delete it"}
      </button>
      <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={tertiaryButtonClass}>
        Keep it
      </button>
    </div>
  );
}
