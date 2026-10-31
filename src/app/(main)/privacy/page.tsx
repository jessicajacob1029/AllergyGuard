import type { Metadata } from "next";
import { ContactLink, LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = {
  title: `Privacy · ${APP_NAME}`,
  description: `What ${APP_NAME} stores, who can see it, and how to delete it.`,
};

const SECTIONS: readonly LegalSection[] = [
  {
    title: "What we store",
    body: (
      <>
        <p>To check food against your allergies, we keep:</p>
        <ul>
          <li>your name and email address</li>
          <li>your allergies and how severe they are</li>
          <li>your emergency contacts</li>
          <li>your medications</li>
          <li>the products you scan and their results</li>
          <li>the reactions you log in your diary</li>
        </ul>
        <p>We don&apos;t sell your data or show you ads.</p>
      </>
    ),
  },
  {
    title: "Where it's stored and who can see it",
    body: (
      <p>
        Your data is stored in Supabase, our database provider. No other user can see your data: every table is
        locked so that only the person who owns a profile can read or change it.
      </p>
    ),
  },
  {
    title: "Signing in with Google",
    body: (
      <p>
        If you use Continue with Google, Google shares your name, email address, profile picture link and a Google
        account ID with us. We only use your name and email. We never see your Google password and can&apos;t
        access anything else in your Google account.
      </p>
    ),
  },
  {
    title: "Barcode scans",
    body: (
      <p>
        When you scan a barcode, our server looks the product up on Open Food Facts, a free public food database.
        Open Food Facts only receives the barcode number, not who you are.
      </p>
    ),
  },
  {
    title: "Label photos",
    body: (
      <p>
        Label photos are read on your phone and never leave your device. Only the ingredient text read from the
        photo is saved with the scan, so you can check it later.
      </p>
    ),
  },
  {
    title: "Your emergency card",
    body: (
      <p>
        A copy of your emergency card (allergies, medications and emergency contacts) is stored on your device so
        it works without internet. It stays there until you log out.
      </p>
    ),
  },
  {
    title: "Deleting your account",
    body: (
      <p>
        To delete your account and all your data, email <ContactLink /> from the address you signed up with.
        We&apos;ll delete it and let you know when it&apos;s done.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      intro={`What ${APP_NAME} keeps about you, in plain English.`}
      sections={SECTIONS}
    />
  );
}
