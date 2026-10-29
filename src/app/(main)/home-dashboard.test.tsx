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
    const allergies = screen.getByText("Your allergies").parentElement!;
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
});
