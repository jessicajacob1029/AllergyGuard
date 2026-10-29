// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactionRow } from "@/lib/diary/reactions";

const { saveReaction, deleteReaction } = vi.hoisted(() => ({ saveReaction: vi.fn(), deleteReaction: vi.fn() }));
vi.mock("./actions", () => ({ saveReaction, deleteReaction }));

import { DeleteReaction } from "./delete-reaction";
import { ReactionCard } from "./reaction-parts";
import { ReactionForm } from "./reaction-form";

const ID = "3f0c2a4e-8b1d-4c7a-9e2f-1a2b3c4d5e6f";
const SCAN = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

beforeEach(() => {
  saveReaction.mockReset();
  deleteReaction.mockReset();
});
afterEach(cleanup);

const reaction: ReactionRow = {
  id: ID,
  occurred_at: "2026-08-12T09:30:00Z",
  food: "Restaurant meal",
  scan_id: null,
  symptoms: ["hives_rash", "lips_throat_swelling"],
  severity: "moderate",
  treatment: "adrenaline",
  notes: null,
};

describe("ReactionCard", () => {
  it("shows the date pill, severity dots with the word, food and symptom pills, and opens the reaction", () => {
    render(<ReactionCard reaction={reaction} />);
    const card = screen.getByRole("link");
    expect(card.getAttribute("href")).toBe(`/diary/${ID}`);
    expect(card.querySelector("time")?.getAttribute("dateTime")).toBe("2026-08-12T09:30:00Z");
    expect(card.querySelector("time")?.textContent).toMatch(/^\d{2} AUG 2026$/);
    expect(within(card).getByText("Moderate")).toBeTruthy();
    expect(within(card).getByText("Restaurant meal")).toBeTruthy();
    expect(within(card).getByText("Symptoms:")).toBeTruthy();
    expect(within(card).getByText("Hives or rash")).toBeTruthy();
    expect(within(card).getByText("Lips or throat swelling")).toBeTruthy();
    expect(within(card).getByText("EpiPen (adrenaline)")).toBeTruthy();
  });

  it("says Symptom (singular) for one symptom and hides a 'None' treatment", () => {
    render(<ReactionCard reaction={{ ...reaction, symptoms: ["itching"], treatment: "none" }} />);
    expect(screen.getByText("Symptom:")).toBeTruthy();
    expect(screen.queryByText("Treatment:")).toBeNull();
  });
});

describe("ReactionForm", () => {
  it("starts at the current local time and lists every symptom, treatment and severity", () => {
    render(<ReactionForm reactionId={null} initial={{}} cancelHref="/diary" />);
    const when = screen.getByLabelText("When did it happen?") as HTMLInputElement;
    expect(when.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(9);
    expect(screen.getByRole("button", { name: "Lips or throat swelling" })).toBeTruthy();
    for (const name of ["None", "Antihistamine", "EpiPen (adrenaline)", "Hospital or ER", "Mild", "Moderate", "Severe"]) {
      expect(screen.getByRole("radio", { name })).toBeTruthy();
    }
    expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe("/diary");
  });

  it("shows what is missing and doesn't save", async () => {
    const user = userEvent.setup();
    render(<ReactionForm reactionId={null} initial={{}} cancelHref="/diary" />);
    await user.click(screen.getByRole("button", { name: "Save reaction" }));
    expect(screen.getByText("Enter what you ate or touched.")).toBeTruthy();
    expect(screen.getByText("Choose at least one symptom.")).toBeTruthy();
    expect(screen.getByText("Choose how bad it was.")).toBeTruthy();
    expect(screen.getByLabelText("Food or product").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("Food or product"));
    expect(saveReaction).not.toHaveBeenCalled();
  });

  it("saves a filled-in reaction with the time as a full ISO timestamp", async () => {
    saveReaction.mockResolvedValue({ error: "stop here" });
    const user = userEvent.setup();
    render(<ReactionForm reactionId={null} initial={{}} cancelHref="/diary" />);
    await user.type(screen.getByLabelText("Food or product"), "Snickers");
    await user.click(screen.getByRole("button", { name: "Itching" }));
    await user.click(screen.getByRole("button", { name: "Lips or throat swelling" }));
    await user.click(screen.getByRole("radio", { name: "Severe" }));
    await user.click(screen.getByRole("radio", { name: "EpiPen (adrenaline)" }));
    await user.click(screen.getByRole("button", { name: "Save reaction" }));

    expect(saveReaction).toHaveBeenCalledTimes(1);
    const [input, id] = saveReaction.mock.calls[0];
    expect(id).toBeNull();
    expect(input).toMatchObject({
      food: "Snickers",
      symptoms: ["itching", "lips_throat_swelling"],
      severity: "severe",
      treatment: "adrenaline",
      scanId: null,
    });
    expect(input.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
    expect((await screen.findByRole("alert")).textContent).toBe("stop here");
  });

  it("can clear an optional treatment", async () => {
    const user = userEvent.setup();
    render(<ReactionForm reactionId={null} initial={{}} cancelHref="/diary" />);
    await user.click(screen.getByRole("radio", { name: "Antihistamine" }));
    await user.click(screen.getByRole("button", { name: "Clear treatment" }));
    expect((screen.getByRole("radio", { name: "Antihistamine" }) as HTMLInputElement).checked).toBe(false);
  });

  it("starts from a scan with the product filled in and the link removable", async () => {
    const user = userEvent.setup();
    render(
      <ReactionForm
        reactionId={null}
        initial={{ food: "Amul butter", scanId: SCAN }}
        scanLabel="Amul butter"
        cancelHref={`/scans/${SCAN}`}
      />,
    );
    expect((screen.getByLabelText("Food or product") as HTMLInputElement).value).toBe("Amul butter");
    expect(screen.getByText("Linked to your scan of Amul butter.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Remove link" }));
    expect(screen.queryByText(/Linked to your scan/)).toBeNull();
  });

  it("edits an existing reaction with its saved values", async () => {
    saveReaction.mockResolvedValue({ error: "stop here" });
    const user = userEvent.setup();
    render(
      <ReactionForm
        reactionId={ID}
        initial={{ occurredAt: reaction.occurred_at, food: reaction.food, symptoms: reaction.symptoms, severity: "moderate", treatment: null, notes: "", scanId: null }}
        cancelHref={`/diary/${ID}`}
      />,
    );
    expect(screen.getByRole("button", { name: "Hives or rash", pressed: true })).toBeTruthy();
    expect((screen.getByRole("radio", { name: "Moderate" }) as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(saveReaction.mock.calls[0][0].occurredAt).toBe("2026-08-12T09:30:00.000Z");
    expect(saveReaction.mock.calls[0][1]).toBe(ID);
  });
});

describe("DeleteReaction", () => {
  it("asks before deleting, and Keep it backs out", async () => {
    const user = userEvent.setup();
    render(<DeleteReaction id={ID} />);
    await user.click(screen.getByRole("button", { name: "Delete reaction" }));
    expect(screen.getByText("Delete this reaction? This can't be undone.")).toBeTruthy();
    expect(deleteReaction).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.getByRole("button", { name: "Delete reaction" })).toBeTruthy();
  });

  it("deletes after confirming and shows a failure", async () => {
    deleteReaction.mockResolvedValue({ error: "We couldn't delete the reaction." });
    const user = userEvent.setup();
    render(<DeleteReaction id={ID} />);
    await user.click(screen.getByRole("button", { name: "Delete reaction" }));
    await user.click(screen.getByRole("button", { name: "Yes, delete it" }));
    expect(deleteReaction).toHaveBeenCalledWith(ID);
    expect((await screen.findByRole("alert")).textContent).toBe("We couldn't delete the reaction.");
  });
});
