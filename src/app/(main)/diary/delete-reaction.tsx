"use client";

import { useState, useTransition } from "react";
import { formAlertClass, secondaryButtonClass } from "@/components/form-styles";
import { TrashIcon } from "@/components/ui/icons";
import { deleteReaction } from "./actions";

// Two separate class strings: mixing bg/text classes on one element lets the
// wrong one win (it once gave red text on the red confirm button).
const buttonBase =
  "flex min-h-[50px] w-full items-center justify-center gap-2 rounded-button px-4 text-[15px] font-bold " +
  "disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const dangerButtonClass = `${buttonBase} border border-unsafe-ink/25 bg-white/75 text-unsafe-ink`;
const dangerConfirmClass = `${buttonBase} bg-emergency text-white`;

/** Delete, with a confirm step in the page (no browser pop-up). Sits beside Edit; the confirm takes the full row. */
export function DeleteReaction({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        aria-label="Delete reaction"
        onClick={() => setConfirming(true)}
        className={`${dangerButtonClass} flex-1 basis-0`}
      >
        <TrashIcon className="size-[18px]" />
        Delete
      </button>
    );
  }

  return (
    <div role="group" aria-labelledby="delete-confirm" className="glass basis-full space-y-2.5 rounded-[24px] p-5 text-center">
      <span
        aria-hidden="true"
        className="mx-auto flex size-[52px] items-center justify-center rounded-[16px] bg-unsafe-band text-unsafe-ink"
      >
        <TrashIcon className="size-6" />
      </span>
      <p id="delete-confirm" className="text-lg font-semibold text-ink">
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
      <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={secondaryButtonClass}>
        Keep it
      </button>
    </div>
  );
}
