"use client";

import Link from "next/link";
import { AlertIcon } from "@/components/ui/icons";
import { useHydrated } from "@/components/ui/local-time";
import type { MedicationRow } from "@/lib/profile/types";
import { localDate, medicationAlerts, whenText } from "@/lib/reminders/alerts";
import { formatExpiryDate } from "@/lib/reminders/format";

/**
 * Home banner for medications that have expired (red) or expire within 30
 * days (amber). Worked out with the phone's date, so it renders after
 * hydration (the server runs in UTC). Nothing when nothing is due.
 */
export function MedicationBanner({ medications }: { medications: readonly MedicationRow[] }) {
  const hydrated = useHydrated();
  if (!hydrated) return null;
  const { expired, soon } = medicationAlerts(medications, localDate(new Date()));
  const total = expired.length + soon.length;
  if (total === 0) return null;

  const urgent = expired.length > 0;
  const first = urgent ? expired[0] : soon[0];
  const name = first.medication.name;
  const date = formatExpiryDate(first.medication.expiry_date ?? "");
  const headline =
    total > 1
      ? `${total} medications need attention`
      : urgent
        ? `Your ${name} expired on ${date}`
        : `Your ${name} expires ${whenText(first.daysLeft)}${first.daysLeft > 1 ? ` (${date})` : ""}`;
  const detail =
    total > 1
      ? urgent
        ? `${expired.length} expired, ${soon.length} expiring within 30 days.`
        : "They expire within 30 days."
      : urgent
        ? "Replace it and update the date. Expired medication may not work properly."
        : "Plan to replace it, then update the date.";

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-[20px] border p-4 text-ink desk:col-span-2 ${
        urgent ? "border-unsafe-ink/25 bg-unsafe-band" : "border-caution-ink/20 bg-caution-band"
      }`}
    >
      <AlertIcon className={`mt-0.5 size-5 shrink-0 ${urgent ? "text-unsafe-ink" : "text-caution-ink"}`} />
      <div className="min-w-0 text-base">
        <p className={`font-bold ${urgent ? "text-unsafe-ink" : "text-caution-ink"}`}>{headline}</p>
        <p className="mt-1 text-sm">
          {detail}{" "}
          <Link
            href="/profile#medications"
            className={`inline-flex min-h-11 items-center font-bold underline underline-offset-2 ${urgent ? "text-unsafe-ink" : "text-caution-ink"}`}
          >
            Update medications
          </Link>
        </p>
      </div>
    </div>
  );
}
