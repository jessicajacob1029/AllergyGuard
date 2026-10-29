"use client";

import { useEffect, useState } from "react";
import { InstallHint } from "@/components/install-hint";
import { allergenEmoji } from "@/components/ui/allergen-emoji";
import { MedicineIcon, OfflineIcon, PhoneIcon } from "@/components/ui/icons";
import { SEVERITY_LABELS } from "@/lib/allergen/codes";
import { formatSyncedAt, sortAllergensForCard } from "@/lib/offline/card-format";
import type { EmergencyCard } from "@/lib/offline/db";
import { readEmergencyCards } from "@/lib/offline/emergency-card";
import { selectionLabel } from "@/lib/profile/allergen-selection";
import { telHref } from "@/lib/profile/phone";
import { isExpired, todayIso } from "@/lib/profile/validation";

type State =
  | { status: "loading" }
  | { status: "ready"; cards: EmergencyCard[] }
  | { status: "unavailable" };

/** Reads the card from Dexie only. Never touches the network. */
export function EmergencyCardView() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    readEmergencyCards().then(
      (cards) => setState({ status: "ready", cards }),
      (error) => {
        console.error("Could not read the offline emergency card", error);
        setState({ status: "unavailable" });
      },
    );
  }, []);

  if (state.status === "loading") {
    return <p className="mt-6 text-base text-[#5b4f4f]">Loading…</p>;
  }
  if (state.status === "unavailable" || state.cards.length === 0) {
    return (
      <div className="mt-6 space-y-2 rounded-[18px] border border-[#d7cecc] bg-white p-5 text-base text-[#291f1f]">
        <p className="font-bold">No emergency info saved on this device.</p>
        <p className="text-[#5b4f4f]">
          {state.status === "unavailable"
            ? "This browser isn't letting AllergyGuard store data (private browsing can do this)."
            : "Log in while you have internet once, and your allergies, medications and emergency contact are saved here for offline use."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-12">
      <InstallHint />
      {state.cards.map((card) => (
        <CardDetails key={card.profileId} card={card} />
      ))}
    </div>
  );
}

function CardDetails({ card }: { card: EmergencyCard }) {
  const [primary, ...others] = card.contacts;
  const today = todayIso();

  return (
    <article className="space-y-6" aria-labelledby={`card-${card.profileId}`}>
      <h2 id={`card-${card.profileId}`} className="text-[28px] font-medium leading-tight tracking-[-0.045em] text-[#2a1717]">
        {card.name}
      </h2>

      {/* The call button comes first, above the fold: in an emergency nobody
          should have to scroll for it. */}
      {primary ? (
        <a
          href={telHref(primary.phone)}
          className="flex min-h-[78px] w-full items-center justify-center gap-3 rounded-[19px] bg-emergency px-4 py-3 text-center text-white shadow-[0_8px_18px_rgb(160_27_27/0.21)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <PhoneIcon className="size-7 shrink-0" />
          <span className="flex flex-col">
            <span className="text-xl font-bold">Call {primary.name}</span>
            <span className="font-mono text-xs font-bold tracking-[0.08em]">
              {primary.relationship ? `${primary.relationship} · ` : ""}
              {primary.phone}
            </span>
          </span>
        </a>
      ) : (
        <p className="rounded-[14px] border-2 border-[#c08316] bg-[#fff9e9] p-4 text-base font-bold text-[#6b4500]">
          No emergency contact saved.
        </p>
      )}

      <section aria-labelledby={`allergies-${card.profileId}`}>
        <h3 id={`allergies-${card.profileId}`} className="eyebrow mb-2.5 text-[#4e3b3b]">
          Allergies · severe first
        </h3>
        <ul className="space-y-2">
          {sortAllergensForCard(card.allergens).map((allergen) => (
            <li
              key={allergen.id}
              className={`flex min-h-[57px] items-center justify-between gap-3 rounded-[14px] border-2 px-4 py-2 ${
                allergen.severity === "severe"
                  ? "border-[#b82222] bg-[#fff3f1] text-[#7b1515]"
                  : allergen.severity === "moderate"
                    ? "border-[#c08316] bg-[#fff9e9] text-[#6b4500]"
                    : "border-[#d7cecc] bg-white text-[#291f1f]"
              }`}
            >
              <span className="flex items-center gap-2 text-[17px] font-bold">
                <span aria-hidden="true">{allergenEmoji(allergen)}</span>
                {selectionLabel(allergen)}
              </span>
              {allergen.severity && (
                <span className="font-mono text-[11px] font-bold uppercase tracking-[0.06em]">
                  {SEVERITY_LABELS[allergen.severity]}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby={`meds-${card.profileId}`}>
        <h3 id={`meds-${card.profileId}`} className="eyebrow mb-2.5 text-[#4e3b3b]">
          Medications
        </h3>
        {card.medications.length === 0 ? (
          <p className="text-base text-[#5b4f4f]">None saved.</p>
        ) : (
          <ul className="space-y-2">
            {card.medications.map((med) => (
              <li
                key={med.id}
                className="flex min-h-[60px] flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border border-[#d7cecc] bg-white px-3.5 py-2.5 text-base text-[#291f1f]"
              >
                <MedicineIcon className="size-5 shrink-0" />
                <span className="font-bold">{med.name}</span>
                {med.dose && <span className="text-[#5b4f4f]">{med.dose}</span>}
                {isExpired(med.expiry_date, today) && (
                  <span className="rounded-[6px] bg-unsafe-band px-1.5 py-0.5 text-sm font-bold text-unsafe-ink">
                    Expired {med.expiry_date}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {others.length > 0 && (
        <section aria-labelledby={`contacts-${card.profileId}`}>
          <h3 id={`contacts-${card.profileId}`} className="eyebrow mb-2.5 text-[#4e3b3b]">
            Other contacts
          </h3>
          <ul className="space-y-2">
            {others.map((contact) => (
              <li key={contact.id}>
                <a
                  href={telHref(contact.phone)}
                  className="flex min-h-[65px] items-center gap-3 rounded-[14px] border border-[#d7cecc] bg-white px-3.5 py-2.5 text-[#291f1f] focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold">
                      Call {contact.name}
                      {contact.relationship && <span className="font-normal text-[#5b4f4f]"> ({contact.relationship})</span>}
                    </span>
                    <span className="block text-sm text-[#5b4f4f]">{contact.phone}</span>
                  </span>
                  <PhoneIcon className="size-5 shrink-0 text-emergency" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-1 font-mono text-[11px] font-bold tracking-[0.04em] text-[#4e4545]">
        <p className="flex items-center gap-1.5">
          <OfflineIcon className="size-4" />
          Saved on this device, works offline.
        </p>
        <p>Last updated {formatSyncedAt(card.syncedAt)}</p>
      </div>
    </article>
  );
}
