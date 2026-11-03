// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileRow } from "@/lib/profile/types";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/profile/save", () => ({
  saveProfileName: vi.fn(),
  saveAllergens: vi.fn(),
  saveMedications: vi.fn(),
}));

const save = await import("@/lib/profile/save");
const { NameSection } = await import("./name-section");
const { AllergensSection } = await import("./allergens-section");
const { MedicationsSection } = await import("./medications-section");

const profile: ProfileRow = {
  id: "p1",
  name: "Asha",
  disclaimer_accepted_at: "2026-09-25T10:00:00Z",
  onboarding_step: 6,
  onboarding_completed_at: "2026-09-25T10:05:00Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("NameSection", () => {
  it("renames the profile", async () => {
    const user = userEvent.setup();
    vi.mocked(save.saveProfileName).mockResolvedValue({ ok: true, data: { ...profile, name: "Asha R" } });
    render(<NameSection initial={profile} />);
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Asha R");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(save.saveProfileName).toHaveBeenCalledWith({}, profile, "Asha R");
    expect(await screen.findByText("Name saved.")).toBeTruthy();
  });

  it("does not save an empty name", async () => {
    const user = userEvent.setup();
    render(<NameSection initial={profile} />);
    await user.clear(screen.getByLabelText("Name"));
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(save.saveProfileName).not.toHaveBeenCalled();
  });
});

describe("AllergensSection", () => {
  it("won't save an empty allergen list", async () => {
    const user = userEvent.setup();
    render(
      <AllergensSection
        profile={profile}
        initial={[{ kind: "predefined", code: "milk", severity: null, id: "a1" }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Remove Milk" }));
    await user.click(screen.getByRole("button", { name: "Save allergies" }));
    expect(save.saveAllergens).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/at least one allergen/);
  });

  it("saves changes against the saved list", async () => {
    const user = userEvent.setup();
    const saved = [{ kind: "predefined" as const, code: "milk" as const, severity: null, id: "a1" }];
    vi.mocked(save.saveAllergens).mockResolvedValue({ ok: true, data: { profile, allergens: saved } });
    render(<AllergensSection profile={profile} initial={saved} />);
    await user.click(screen.getByRole("button", { name: "Egg" }));
    await user.click(screen.getByRole("button", { name: "Save allergies" }));
    expect(save.saveAllergens).toHaveBeenCalledWith({}, profile, saved, [
      saved[0],
      { kind: "predefined", code: "egg", severity: null },
    ]);
    expect(await screen.findByText("Allergies saved.")).toBeTruthy();
  });
});

describe("MedicationsSection", () => {
  it("saves the edited list and shows the saved rows", async () => {
    const user = userEvent.setup();
    const row = { id: "m1", name: "EpiPen", dose: null, expiry_date: null };
    vi.mocked(save.saveMedications).mockResolvedValue({ ok: true, data: [row] });
    render(<MedicationsSection profile={profile} initial={[]} />);
    await user.click(screen.getByRole("button", { name: "Add a medication" }));
    await user.type(screen.getByLabelText("Name"), "EpiPen");
    await user.click(screen.getByRole("button", { name: "Save medications" }));
    expect(save.saveMedications).toHaveBeenCalledWith({}, profile, [], [
      expect.objectContaining({ name: "EpiPen" }),
    ]);
    expect(await screen.findByText("Medications saved.")).toBeTruthy();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("EpiPen");
  });
});
