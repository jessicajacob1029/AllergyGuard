import { tertiaryButtonClass } from "@/components/form-styles";
import { SignOutButton } from "@/components/sign-out-button";
import { HeaderBand } from "@/components/ui/header-band";
import type { ContactRow, ProfileBundle } from "@/lib/profile/types";
import { AllergensSection } from "./allergens-section";
import { ContactsSection } from "./contacts-section";
import { MedicationsSection } from "./medications-section";
import { NameSection } from "./name-section";

/** The /profile screen. Pure view: the page loads the data. */
export function ProfileView({ bundle, contacts }: { bundle: ProfileBundle; contacts: ContactRow[] }) {
  return (
    <main className="flex flex-1 flex-col">
      <HeaderBand
        eyebrow="Your account"
        title="Your profile"
        subtitle={`${bundle.profile.name}. Keep your safety information accurate and up to date.`}
        aside={
          <span
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(145deg,#9a8df2,#6654cf)] text-lg font-bold text-white shadow-[0_8px_18px_rgb(96_79_201/0.22)]"
          >
            {initials(bundle.profile.name)}
          </span>
        }
      />
      <div className="mx-auto w-full max-w-sm space-y-3.5 px-4 pb-6">
        <NameSection initial={bundle.profile} />
        <AllergensSection profile={bundle.profile} initial={bundle.allergens} />
        <ContactsSection profile={bundle.profile} initial={contacts} />
        <MedicationsSection profile={bundle.profile} initial={bundle.medications} />
        {/* Here, not next to Emergency in the top bar: logging out wipes the
            offline emergency card, so it shouldn't be one mis-tap away. */}
        <SignOutButton className={tertiaryButtonClass} />
      </div>
    </main>
  );
}

/** Up to two initials for the avatar ("Priya Sharma" → "PS"). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return letters.map((p) => [...p][0]?.toUpperCase() ?? "").join("");
}
