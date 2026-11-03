// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Signed out, for the landing page; the sign-up form's client is never called.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: async () => ({ data: null }) } }),
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: {} }) }));

import Home from "@/app/(main)/page";
import PrivacyPage from "@/app/(main)/privacy/page";
import { SignupForm } from "@/app/(main)/signup/signup-form";
import TermsPage from "@/app/(main)/terms/page";
import { CONTACT_EMAIL } from "@/lib/constants";

afterEach(cleanup);

const hrefOf = (name: string | RegExp) => screen.getByRole("link", { name }).getAttribute("href");

describe("Privacy page", () => {
  it("covers each topic in its own section", () => {
    render(<PrivacyPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Privacy");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "What we store",
      "Where it's stored and who can see it",
      "Signing in with Google",
      "Barcode scans",
      "Label photos and pasted text",
      "Medication reminders",
      "Product change alerts",
      "Your emergency card",
      "Deleting your account",
    ]);
    expect(document.body.textContent).not.toMatch(/coming soon/i);
  });

  it("states the promises the app keeps", () => {
    render(<PrivacyPage />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("No other user can see your data");
    expect(text).toContain("We only use your name and email");
    expect(text).toContain("The photo never leaves your device and isn't saved.");
    expect(text).toContain("until you log out");
    expect(text).toContain("Resend");
    expect(text).toContain("link to turn emails off without logging in");
    expect(text).toContain("only receives the barcode number, from our server, never who you are");
    expect(text).toContain("stop watching one product");
  });

  it("gives the email address for deleting an account", () => {
    render(<PrivacyPage />);
    expect(hrefOf(CONTACT_EMAIL)).toBe(`mailto:${CONTACT_EMAIL}`);
  });
});

describe("Terms page", () => {
  it("says the app is not medical advice and to read the label", () => {
    render(<TermsPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Terms");
    expect(screen.getByRole("heading", { name: "An aid, not medical advice" })).toBeTruthy();
    expect(screen.getByText("Always read the label before you eat something.")).toBeTruthy();
    expect(hrefOf(CONTACT_EMAIL)).toBe(`mailto:${CONTACT_EMAIL}`);
  });
});

describe("Links to both pages", () => {
  it("are in the landing page footer", async () => {
    render(await Home());
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Privacy" }).getAttribute("href")).toBe("/privacy");
    expect(within(footer).getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms");
  });

  it("are under the Create account button", () => {
    render(<SignupForm />);
    expect(hrefOf("Terms")).toBe("/terms");
    expect(hrefOf("Privacy policy")).toBe("/privacy");
    const button = screen.getByRole("button", { name: "Create account" });
    const note = screen.getByText(/By creating an account you agree/);
    expect(button.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
