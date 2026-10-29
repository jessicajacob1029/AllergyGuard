import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { autoWidth, primaryButtonClass } from "@/components/form-styles";
import { InstallHint } from "@/components/install-hint";
import { ScanRow } from "@/components/scans/scan-row";
import { allergenEmoji } from "@/components/ui/allergen-emoji";
import { HeaderBand } from "@/components/ui/header-band";
import {
  BookIcon,
  ChevronRightIcon,
  MedicineIcon,
  PersonIcon,
  ScanIcon,
  ShieldIcon,
  SparkleIcon,
} from "@/components/ui/icons";
import { LocalTime } from "@/components/ui/local-time";
import { ComingSoon, Pill } from "@/components/ui/pill";
import { SectionCard } from "@/components/ui/section-card";
import type { Tone } from "@/components/ui/tones";
import { SEVERITY_LABELS } from "@/lib/allergen/codes";
import type { ScanListRow } from "@/lib/products/scan-list";
import { selectionLabel } from "@/lib/profile/allergen-selection";
import type { ProfileBundle } from "@/lib/profile/types";

/** Allergy chips take turns in peach, lilac and mint. */
const CHIP_TONES: Tone[] = ["allergy", "medication", "contact"];

const linkActionClass =
  "eyebrow flex min-h-11 shrink-0 items-center gap-0.5 focus-visible:outline-2 focus-visible:outline-primary";

type Props = {
  bundle: ProfileBundle;
  /** The 3 most recent scans, newest first. */
  latestScans?: readonly ScanListRow[];
  /** "Now" as an ISO time; drawn as the date line in the phone's time zone. */
  today?: string;
};

/** Signed-in home screen. Pure view: the page loads the data. */
export function HomeDashboard({ bundle, latestScans = [], today = new Date().toISOString() }: Props) {
  const allergenCount = bundle.allergens.length;
  return (
    <main className="flex flex-1 flex-col">
      <HeaderBand
        eyebrow={<LocalTime iso={today} format="weekdayDate" />}
        title={
          <>
            Hi,{" "}
            <span className="block text-[#5f4cc4]">{bundle.profile.name}</span>
          </>
        }
      />

      <div className="mx-auto w-full max-w-sm space-y-3.5 px-4 pb-6">
        <InstallHint />

        {!bundle.primaryContact && (
          <div role="status" className="rounded-[20px] border border-caution-ink/20 bg-caution-band p-4 text-base text-ink">
            <p className="font-bold text-caution-ink">Add an emergency contact</p>
            <p className="mt-1 text-sm">
              Your emergency card has no one to call yet.{" "}
              <Link href="/profile#contacts" className="font-bold text-caution-ink underline underline-offset-2">
                Add a contact
              </Link>
            </p>
          </div>
        )}

        <Link
          href="/profile"
          className="glass grid min-h-[78px] grid-cols-[48px_1fr_auto] items-center gap-3 rounded-[22px] px-3.5 py-3 text-ink focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-[15px] bg-band text-primary-ink">
            <ShieldIcon className="size-6" />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-bold">
              {allergenCount} {allergenCount === 1 ? "allergen" : "allergens"} monitored
            </span>
            <span className="block truncate text-sm text-muted">
              {bundle.primaryContact ? `Emergency contact: ${bundle.primaryContact.name}` : "No emergency contact yet"}
            </span>
          </span>
          <ChevronRightIcon className="size-5" />
        </Link>

        <ScanHero />

        <SectionCard
          tone="allergy"
          label="Your profile"
          title="Your allergies"
          action={
            <Link href="/profile#allergies" className={linkActionClass}>
              Manage <ChevronRightIcon className="size-3.5" />
            </Link>
          }
        >
          <ul className="flex flex-wrap gap-2">
            {bundle.allergens.map((a, i) => (
              <li key={a.id}>
                <Pill tone={CHIP_TONES[i % CHIP_TONES.length]} icon={allergenEmoji(a)}>
                  <span>{selectionLabel(a)}</span>
                  {a.severity && <span className="font-normal">· {SEVERITY_LABELS[a.severity]}</span>}
                </Pill>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          tone="primary"
          label="Recent activity"
          title="Latest scans"
          action={
            <Link href="/scans" className={linkActionClass}>
              View all <ChevronRightIcon className="size-3.5" />
            </Link>
          }
        >
          {latestScans.length > 0 ? (
            <div>
              {latestScans.map((scan) => (
                <ScanRow key={scan.id} scan={scan} />
              ))}
            </div>
          ) : (
            <p className="text-[15px] text-muted">No scans yet. Products you check will show up here.</p>
          )}
        </SectionCard>

        <nav aria-label="Shortcuts">
          <ul className="grid grid-cols-2 gap-3">
            <li>
              <Tile Icon={PersonIcon} label="Profile" href="/profile" />
            </li>
            <li>
              {/* Plain <a>: /emergency must load from the service worker offline. */}
              <Tile Icon={ShieldIcon} label="Emergency" href="/emergency" plain emergency />
            </li>
            <li>
              <Tile Icon={BookIcon} label="Diary" href="/diary" />
            </li>
            <li>
              <Tile Icon={MedicineIcon} label="Medication" />
            </li>
          </ul>
        </nav>
      </div>
    </main>
  );
}

/**
 * The scan card. The text has its own block; the orb sits in the bottom row
 * beside the button, so text can never run under it at any width.
 */
function ScanHero() {
  return (
    <section aria-labelledby="scan-heading" className="glass gradient-hero relative overflow-hidden rounded-[28px] px-6 pt-6">
      <p id="scan-heading" className="eyebrow flex items-center gap-1.5">
        <SparkleIcon className="size-4" />
        Scan product
      </p>
      <h2 className="mt-5 text-[40px] font-medium leading-[0.98] tracking-[-0.05em] text-ink max-[359px]:text-[34px]">
        Check food before you eat.
      </h2>
      <div className="mt-4 flex items-end justify-between gap-2">
        <Link href="/scan" className={`${autoWidth(primaryButtonClass)} mb-6 shrink-0 pr-2.5`}>
          Start scanning
          <span aria-hidden="true" className="flex size-[34px] items-center justify-center rounded-[11px] bg-white/15">
            <ScanIcon className="size-[18px]" />
          </span>
        </Link>
        <Orb />
      </div>
    </section>
  );
}

/** Decorative glass orb with a shield (the design's hero visual). */
function Orb() {
  return (
    <span aria-hidden="true" data-orb className="relative -mb-7 -mr-12 block size-[150px] shrink-0 max-[359px]:size-[124px]">
      <span className="absolute -inset-2 rotate-[24deg] rounded-full border border-white/75 border-l-[#7b68df]" />
      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_25%,rgb(255_255_255/0.9),rgb(255_208_193/0.66)_30%,rgb(135_115_225/0.72))] text-white/85 shadow-[inset_12px_12px_30px_rgb(255_255_255/0.62),0_22px_40px_rgb(104_77_157/0.16)]">
        <ShieldIcon className="size-10" />
      </span>
    </span>
  );
}

/** Home shortcut tile. Without `href` it is a non-interactive "Coming soon" tile. */
function Tile({
  Icon,
  label,
  href,
  plain = false,
  emergency = false,
}: {
  Icon: ComponentType<{ className?: string }>;
  label: string;
  href?: string;
  plain?: boolean;
  emergency?: boolean;
}) {
  const body: ReactNode = (
    <>
      <span
        aria-hidden="true"
        className={`flex size-11 items-center justify-center rounded-[14px] ${
          emergency ? "bg-emergency text-white" : "bg-band text-primary-ink"
        }`}
      >
        <Icon className="size-5" />
      </span>
      <span className="text-base font-bold text-ink">{label}</span>
      {href ? <ChevronRightIcon className="size-4 text-muted" /> : <ComingSoon />}
    </>
  );
  const className =
    "glass flex min-h-[124px] flex-col items-center justify-center gap-1.5 rounded-[22px] p-3 text-center focus-visible:outline-2 focus-visible:outline-primary";
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
