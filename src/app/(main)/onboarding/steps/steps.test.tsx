// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AllergensStep } from "./allergens-step";
import { ContactStep } from "./contact-step";
import { DisclaimerStep } from "./disclaimer-step";
import { MedicationsStep } from "./medications-step";
import { NameStep } from "./name-step";

afterEach(cleanup);

const emptyContact = { name: "", phone: "", relationship: "" };

describe("DisclaimerStep", () => {
  it("blocks Continue until the box is ticked", async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    const { rerender } = render(
      <DisclaimerStep accepted={false} onAcceptedChange={() => {}} onContinue={onContinue} />,
    );
    expect(screen.getByText(/is an aid, not medical advice/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByText("Please tick the box to continue.")).toBeTruthy();

    rerender(<DisclaimerStep accepted onAcceptedChange={() => {}} onContinue={onContinue} />);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("reports ticking the box", async () => {
    const user = userEvent.setup();
    const onAcceptedChange = vi.fn();
    render(<DisclaimerStep accepted={false} onAcceptedChange={onAcceptedChange} onContinue={() => {}} />);
    await user.click(screen.getByRole("checkbox"));
    expect(onAcceptedChange).toHaveBeenCalledWith(true);
  });

  it("moves focus to the step heading", () => {
    render(<DisclaimerStep accepted={false} onAcceptedChange={() => {}} onContinue={() => {}} />);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Before you start" }));
  });
});

describe("NameStep", () => {
  it("requires a name and shows save errors", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue("We couldn't save that.");
    render(<NameStep initialName="" onSave={onSave} onBack={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Enter a name for this profile.")).toBeTruthy();

    await user.type(screen.getByLabelText("Name"), "Asha");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onSave).toHaveBeenCalledWith("Asha");
    expect((await screen.findByRole("alert")).textContent).toBe("We couldn't save that.");
    // Button is usable again after a failed save.
    expect(screen.getByRole("button", { name: "Continue" })).toHaveProperty("disabled", false);
  });
});

describe("AllergensStep", () => {
  it("requires at least one allergen", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(null);
    render(<AllergensStep initial={[]} onSave={onSave} onBack={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/at least one allergen/);
  });

  it("accepts a custom allergen on its own", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(null);
    render(<AllergensStep initial={[]} onSave={onSave} onBack={() => {}} />);
    await user.type(screen.getByLabelText("Something else?"), "Lupin{Enter}");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onSave).toHaveBeenCalledWith([{ kind: "custom", name: "Lupin", severity: null }]);
  });
});

describe("ContactStep", () => {
  it("validates before saving", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(null);
    render(<ContactStep initial={emptyContact} onSave={onSave} onSkip={vi.fn()} onBack={() => {}} />);

    await user.type(screen.getByLabelText("Phone number"), "12");
    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Enter your contact's name.")).toBeTruthy();
    expect(screen.getByText(/Include the country code, starting with \+/)).toBeTruthy();
  });

  it("saves a valid contact", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(null);
    render(<ContactStep initial={emptyContact} onSave={onSave} onSkip={vi.fn()} onBack={() => {}} />);
    await user.type(screen.getByLabelText("Name"), "Ravi");
    await user.type(screen.getByLabelText("Phone number"), "+91 98765 43210");
    await user.type(screen.getByLabelText(/Relationship/), "Brother");
    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(onSave).toHaveBeenCalledWith({
      name: "Ravi",
      phone: "+91 98765 43210",
      relationship: "Brother",
    });
  });

  it("can be skipped with Add later, even with half-filled fields", async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn().mockResolvedValue(null);
    const onSave = vi.fn();
    render(<ContactStep initial={emptyContact} onSave={onSave} onSkip={onSkip} onBack={() => {}} />);
    await user.type(screen.getByLabelText("Phone number"), "12");
    await user.click(screen.getByRole("button", { name: "Add later" }));
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("MedicationsStep", () => {
  it("can finish with no medications", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(null);
    render(<MedicationsStep initial={[]} onSave={onSave} onBack={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(onSave).toHaveBeenCalledWith([]);
  });

  it("adds, validates and removes medications, dropping blank cards", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(null);
    render(<MedicationsStep initial={[]} onSave={onSave} onBack={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Add a medication" }));
    await user.click(screen.getByRole("button", { name: "Add a medication" }));
    await user.click(screen.getByRole("button", { name: "Add a medication" }));
    const cards = screen.getAllByRole("listitem");
    await user.type(within(cards[0]).getByLabelText("Name"), "EpiPen");
    await user.type(within(cards[0]).getByLabelText(/Dose/), "0.3 mg");
    await user.type(within(cards[1]).getByLabelText(/Dose/), "10 mg"); // no name
    // cards[2] stays blank and is dropped on submit

    await user.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Enter the medication's name.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Remove Medication 2" }));
    await user.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({ name: "EpiPen", dose: "0.3 mg", expiryDate: "" }),
    ]);
  });

  it("warns about an expired medication but still allows saving it", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(null);
    render(
      <MedicationsStep
        initial={[{ key: "m1", id: "m1", name: "EpiPen", dose: "", expiryDate: "2020-01-01" }]}
        onSave={onSave}
        onBack={() => {}}
      />,
    );
    expect(screen.getByText(/This has expired/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(onSave).toHaveBeenCalledOnce();
  });
});
