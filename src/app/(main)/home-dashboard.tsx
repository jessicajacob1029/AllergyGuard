import Link from "next/link";
import type { ReactNode } from "react";
import { primaryButtonClass } from "@/components/form-styles";
import { InstallHint } from "@/components/install-hint";
import { allergenEmoji } from "@/components/ui/allergen-emoji";
import { HeaderBand } from "@/components/ui/header-band";
import { ChevronRightIcon } from "@/components/ui/icons";
import { ComingSoon, Pill } from "@/components/ui/pill";
import { SectionCard, SectionLabel } from "@/components/ui/section-card";
import { TONE_BAND, TONE_INK, type Tone } from "@/components/ui/tones";
import { selectionLabel } from "@/lib/profile/allergen-selection";
import type { ProfileBundle } from "@/lib/profile/types";

/** Signed-in home screen. Pure view: the page loads the bundle. */
export function HomeDashboard({ bundle }: { bundle: ProfileBundle }) {
  return (
    <main className="flex flex-1 flex-col bg-page">
      <HeaderBand title={`Hi, ${bundle.profile.name}`} emoji="👋" />
      <div className="mx-auto w-full max-w-sm space-y-6 px-4 py-6">
        <InstallHint />

        {!bundle.primaryContact && (
          <div
            role="status"
            className="rounded-card border border-l-4 border-line border-l-caution-ink bg-caution-band p-4 text-base text-ink"
          >
            <p className="font-black text-caution-ink">Add an emergency contact</p>
            <p className="mt-1 text-sm font-semibold">
              Your emergency card has no one to call yet.{" "}
              <Link href="/profile#contacts" className="font-extrabold text-caution-ink underline underline-offset-2">
                Add a contact
              </Link>
            </p>
          </div>
        )}

        <section aria-labelledby="scan-heading" className="rounded-card border border-primary-ink/15 bg-band p-4">
          <SectionLabel tone="primary" id="scan-heading">
            <span aria-hidden="true">🔍 </span>Scan product
          </SectionLabel>
          <p className="mt-2 text-lg font-black text-primary-ink">Check food before you eat.</p>
          <Link href="/scan" className={`mt-3 ${primaryButtonClass}`}>
            Start scanning
          </Link>
        </section>

        <SectionCard tone="allergy" label="Your allergies">
          <ul className="flex flex-wrap gap-2">
            {bundle.allergens.map((a) => (
              <li key={a.id}>
                <Pill tone="allergy" icon={allergenEmoji(a)}>
                  {selectionLabel(a)}
                </Pill>
              </li>
            ))}
          </ul>
        </SectionCard>

        <nav aria-label="Shortcuts">
          <ul className="grid grid-cols-2 gap-3">
            <li>
              <Tile tone="primary" emoji="👤" label="Profile" href="/profile" />
            </li>
            <li>
              {/* Plain <a>: /emergency must load from the service worker offline. */}
              <Tile tone="unsafe" emoji="🚨" label="Emergency" href="/emergency" plain />
            </li>
            <li>
              <Tile tone="medication" emoji="📖" label="Diary" href="/diary" />
            </li>
            <li>
              <Tile tone="contact" emoji="💊" label="Medication" />
            </li>
          </ul>
        </nav>
      </div>
    </main>
  );
}

/** Home grid tile. Without `href` it is a non-interactive "Coming soon" tile. */
function Tile({
  tone,
  emoji,
  label,
  href,
  plain = false,
}: {
  tone: Tone;
  emoji: string;
  label: string;
  href?: string;
  plain?: boolean;
}) {
  const body: ReactNode = (
    <>
      <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-field bg-card text-2xl shadow-card">
        {emoji}
      </span>
      <span className={`text-base font-black ${TONE_INK[tone]}`}>{label}</span>
      {href ? <ChevronRightIcon className={`size-5 ${TONE_INK[tone]}`} /> : <ComingSoon />}
    </>
  );
  const className = `flex min-h-32 flex-col items-center justify-center gap-1.5 rounded-card border border-line p-3 text-center ${TONE_BAND[tone]}`;
  if (!href) return <div className={className}>{body}</div>;
  if (plain) {
    return (
      <a href={href} className={className}>
        {body}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}
