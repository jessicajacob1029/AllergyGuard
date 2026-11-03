import type { Metadata } from "next";
import Link from "next/link";
import { linkClass } from "@/components/form-styles";
import { ContactLink, LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `Terms · ${APP_NAME}`,
  description: `The terms for using ${APP_NAME}.`,
};

const SECTIONS: readonly LegalSection[] = [
  {
    title: "An aid, not medical advice",
    body: (
      <>
        <p>
          {APP_NAME} helps you check food against your allergies. It doesn&apos;t replace advice from your doctor,
          and it can be wrong.
        </p>
        <p className="font-semibold text-ink">Always read the label before you eat something.</p>
      </>
    ),
  },
  {
    title: "Product information can be wrong",
    body: (
      <p>
        Product details come from Open Food Facts, which anyone can edit, and recipes change. Ingredient lists can
        be missing, out of date or wrong. When we&apos;re not sure, we show Caution, never Safe.
      </p>
    ),
  },
  {
    title: "In an emergency",
    body: (
      <p>
        If someone is having a serious allergic reaction, use their adrenaline auto-injector if they have one and
        call your local emergency number (112 in India) straight away. Don&apos;t wait for the app.
      </p>
    ),
  },
  {
    title: "Your account",
    body: (
      <>
        <p>
          Keep your login details private, and keep your allergies, medications and emergency contacts up to date.
          The app can only check against what you&apos;ve entered.
        </p>
        <p>
          To delete your account, email <ContactLink />. Our{" "}
          <Link href="/privacy" className={linkClass}>
            Privacy page
          </Link>{" "}
          explains what we store.
        </p>
      </>
    ),
  },
  {
    title: "No guarantees",
    body: (
      <p>
        {APP_NAME} is a student project, provided as it is. We do our best to keep it working and accurate, but we
        can&apos;t promise it will always be available or correct.
      </p>
    ),
  },
];

export default function TermsPage() {
  return <LegalPage title="Terms" intro={`The rules for using ${APP_NAME}, in plain English.`} sections={SECTIONS} />;
}
