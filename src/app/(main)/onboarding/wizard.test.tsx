// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileRow } from "@/lib/profile/types";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/profile/save", () => ({
  saveProfileName: vi.fn(),
  saveAllergens: vi.fn(),
  savePrimaryContact: vi.fn(),
  skipContact: vi.fn(),
  saveMedications: vi.fn(),
  finishOnboarding: vi.fn(),
}));

const save = await import("@/lib/profile/save");
const { OnboardingWizard } = await import("./wizard");

const profile = (step: number, completed = false): ProfileRow => ({
  id: "p1",
  name: "Asha",
  disclaimer_accepted_at: "2026-09-25T10:00:00Z",
  onboarding_step: step,
  onboarding_completed_at: completed ? "2026-09-25T10:05:00Z" : null,
});

beforeEach(() => {
  vi.mocked(save.saveProfileName).mockResolvedValue({ ok: true, data: profile(2) });
  vi.mocked(save.saveAllergens).mockResolvedValue({
    ok: true,
    data: {
      profile: profile(3),
      allergens: [{ kind: "predefined", code: "peanut", severity: null, id: "a1" }],
    },
  });
  vi.mocked(save.skipContact).mockResolvedValue({ ok: true, data: profile(4) });
  vi.mocked(save.saveMedications).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(save.finishOnboarding).mockResolvedValue({ ok: true, data: profile(6, true) });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OnboardingWizard", () => {
  it("walks a new user through every step", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard initialStep={1} bundle={null} />);

    // 1. Disclaimer: kept in wizard state, nothing saved yet.
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(save.saveProfileName).not.toHaveBeenCalled();

    // 2. Name: creates the profile (existing = null).
    await user.type(screen.getByLabelText("Name"), "Asha");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(save.saveProfileName).toHaveBeenCalledWith({}, null, "Asha");

    // 3. Allergens.
    await user.click(await screen.findByRole("button", { name: "Peanut" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(save.saveAllergens).toHaveBeenCalledOnce();

    // 4. Contact: the phone starts with the +91 country code; then Add later.
    const addLater = await screen.findByRole("button", { name: "Add later" });
    expect((screen.getByLabelText("Phone number") as HTMLInputElement).value).toBe("+91 ");
    await user.click(addLater);
    expect(save.skipContact).toHaveBeenCalledOnce();

    // 5. Medications: finish with none.
    await user.click(await screen.findByRole("button", { name: "Finish setup" }));
    expect(save.saveMedications).toHaveBeenCalledOnce();
    expect(save.finishOnboarding).toHaveBeenCalledOnce();

    expect(await screen.findByRole("heading", { name: "You're all set" })).toBeTruthy();
    expect(screen.getByText(/add an emergency contact any time/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to home" }).getAttribute("href")).toBe("/");
  });

  it("resumes at the given step with saved data", async () => {
    render(
      <OnboardingWizard
        initialStep={3}
        bundle={{
          profile: profile(2),
          allergens: [{ kind: "predefined", code: "milk", severity: "severe", id: "a1" }],
          primaryContact: null,
          medications: [],
        }}
      />,
    );
    expect(screen.getByText("Step 3 of 5")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Milk" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("goes Back to the disclaimer with it still ticked", async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard initialStep={1} bundle={null} />);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  });

  it("stays on the step and shows the error when a save fails", async () => {
    const user = userEvent.setup();
    vi.mocked(save.saveProfileName).mockResolvedValue({ ok: false, error: "No connection." });
    render(<OnboardingWizard initialStep={1} bundle={null} />);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.type(screen.getByLabelText("Name"), "Asha");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No connection.");
    expect(screen.getByText("Step 2 of 5")).toBeTruthy();
  });

  it("starts the name step with the Google account's name, which stays editable", () => {
    render(<OnboardingWizard initialStep={2} bundle={null} suggestedName="Priya Sharma" />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("Priya Sharma");
    expect(input.disabled).toBe(false);
  });
});
