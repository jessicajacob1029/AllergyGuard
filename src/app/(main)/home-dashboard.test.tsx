// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ProfileBundle } from "@/lib/profile/types";
import { HomeDashboard } from "./home-dashboard";

afterEach(cleanup);

const bundle: ProfileBundle = {
  profile: {
    id: "p1",
    name: "Priya",
    disclaimer_accepted_at: "2026-10-01T00:00:00Z",
    onboarding_step: 6,
    onboarding_completed_at: "2026-10-01T00:00:00Z",
  },
  allergens: [
    { id: "a1", kind: "predefined", code: "peanut", severity: "severe" },
    { id: "a2", kind: "custom", name: "Kiwi", severity: null },
  ],
  primaryContact: { id: "c1", name: "Asha", phone: "+91 99400 54631", relationship: "Mum", is_primary: true },
  medications: [],
};

describe("HomeDashboard", () => {
  it("greets the user and lists their allergies", () => {
    render(<HomeDashboard bundle={bundle} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Hi, Priya");
    const allergies = screen.getByRole("region", { name: "Your allergies" });
    expect(within(allergies).getByText("Peanut")).toBeTruthy();
    expect(within(allergies).getByText("Kiwi")).toBeTruthy();
  });

  it("links Profile and Emergency; Emergency is a plain link to /emergency", () => {
    render(<HomeDashboard bundle={bundle} />);
    const shortcuts = within(screen.getByRole("navigation", { name: "Shortcuts" }));
    expect(shortcuts.getByRole("link", { name: /Profile/ }).getAttribute("href")).toBe("/profile");
    expect(shortcuts.getByRole("link", { name: /Emergency/ }).getAttribute("href")).toBe("/emergency");
  });

  it("links Diary, shows Medication as Coming soon (not a link), and hides Restaurants and Travel", () => {
    render(<HomeDashboard bundle={bundle} />);
    const shortcuts = within(screen.getByRole("navigation", { name: "Shortcuts" }));
    expect(shortcuts.getAllByRole("link")).toHaveLength(3);
    expect(shortcuts.getByRole("link", { name: /Diary/ }).getAttribute("href")).toBe("/diary");
    expect(shortcuts.getByText("Medication").parentElement?.textContent).toContain("Coming soon");
    expect(screen.queryByText("Restaurants")).toBeNull();
    expect(screen.queryByText("Travel")).toBeNull();
  });

  it("the scan card links to /scan", () => {
    render(<HomeDashboard bundle={bundle} />);
    const scan = screen.getByRole("region", { name: /Scan product/ });
    expect(within(scan).getByRole("link", { name: "Start scanning" }).getAttribute("href")).toBe("/scan");
  });

  it("asks for an emergency contact only when there is none", () => {
    render(<HomeDashboard bundle={bundle} />);
    expect(screen.queryByText("Add an emergency contact")).toBeNull();
    cleanup();
    render(<HomeDashboard bundle={{ ...bundle, primaryContact: null }} />);
    expect(screen.getByRole("link", { name: "Add a contact" }).getAttribute("href")).toBe("/profile#contacts");
  });

  it("shows the latest scans with their verdicts, and links to the full history", () => {
    const latestScans = [
      { id: "s1", input: "manual", barcode: "8901262010016", product_name: "Amul butter", brands: "Amul", verdict: "unsafe" as const, created_at: "2026-10-29T03:20:00Z" },
      { id: "s2", input: "photo", barcode: null, product_name: null, brands: null, verdict: "caution" as const, created_at: "2026-10-28T10:00:00Z" },
    ];
    render(<HomeDashboard bundle={bundle} latestScans={latestScans} />);
    const card = within(screen.getByRole("region", { name: "Latest scans" }));
    expect(card.getByRole("link", { name: /View all/ }).getAttribute("href")).toBe("/scans");
    const rows = card.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/scans/"));
    expect(rows.map((a) => a.getAttribute("href"))).toEqual(["/scans/s1", "/scans/s2"]);
    // Verdicts are words (with an icon), never colour alone.
    expect(rows[0].textContent).toContain("Unsafe");
    expect(rows[1].textContent).toContain("Caution");
  });

  it("says so when there are no scans yet", () => {
    render(<HomeDashboard bundle={bundle} latestScans={[]} />);
    const card = within(screen.getByRole("region", { name: "Latest scans" }));
    expect(card.getByText(/No scans yet/)).toBeTruthy();
  });

  it("summarises the profile: allergen count and emergency contact", () => {
    render(<HomeDashboard bundle={bundle} />);
    const summary = screen.getByRole("link", { name: /allergens monitored/ });
    expect(summary.getAttribute("href")).toBe("/profile");
    expect(summary.textContent).toContain("2 allergens monitored");
    expect(summary.textContent).toContain("Emergency contact: Asha");
  });
});
