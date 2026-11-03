// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContactRow, ProfileRow } from "@/lib/profile/types";

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/profile/load", () => ({ loadContacts: vi.fn() }));
vi.mock("@/lib/profile/save", () => ({
  SAVE_ERROR: "We couldn't save that.",
  addContact: vi.fn(),
  updateContact: vi.fn(),
  setPrimaryContact: vi.fn(),
  deleteContact: vi.fn(),
}));

const load = await import("@/lib/profile/load");
const save = await import("@/lib/profile/save");
const { ContactsSection } = await import("./contacts-section");

const profile: ProfileRow = {
  id: "p1",
  name: "Test",
  disclaimer_accepted_at: "2026-09-25T10:00:00Z",
  onboarding_step: 6,
  onboarding_completed_at: "2026-09-25T10:05:00Z",
};
const contact = (id: string, name: string, is_primary: boolean): ContactRow => ({
  id,
  name,
  phone: "+91 98765 43210",
  relationship: null,
  is_primary,
});
const ravi = contact("c1", "Ravi", true);
const asha = contact("c2", "Asha", false);

beforeEach(() => {
  vi.mocked(save.addContact).mockResolvedValue({ ok: true, data: ravi });
  vi.mocked(save.updateContact).mockResolvedValue({ ok: true, data: ravi });
  vi.mocked(save.setPrimaryContact).mockResolvedValue({ ok: true, data: null });
  vi.mocked(save.deleteContact).mockResolvedValue({ ok: true, data: { promotedId: null } });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const status = () => screen.getByRole("status").textContent;

describe("ContactsSection", () => {
  it("lists contacts with a Primary badge and a tel: link", () => {
    render(<ContactsSection profile={profile} initial={[ravi, asha]} />);
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("Primary")).toBeTruthy();
    expect(within(items[1]).queryByText("Primary")).toBeNull();
    expect(within(items[0]).getByRole("link").getAttribute("href")).toBe("tel:+919876543210");
    // Only non-primary contacts can be made primary.
    expect(screen.queryByRole("button", { name: "Make Ravi primary" })).toBeNull();
    expect(screen.getByRole("button", { name: "Make Asha primary" })).toBeTruthy();
  });

  it("adds the first contact as primary", async () => {
    const user = userEvent.setup();
    vi.mocked(load.loadContacts).mockResolvedValue([ravi]);
    render(<ContactsSection profile={profile} initial={[]} />);
    expect(screen.getByText("No emergency contacts yet.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Add a contact" }));
    await user.type(screen.getByLabelText("Name"), "Ravi");
    const phone = screen.getByLabelText("Phone number") as HTMLInputElement;
    expect(phone.value).toBe("+91 "); // prefilled country code
    await user.type(phone, "98765 43210");
    await user.click(screen.getByRole("button", { name: "Add contact" }));

    expect(save.addContact).toHaveBeenCalledWith(
      {},
      "p1",
      expect.objectContaining({ name: "Ravi", phone: "+91 98765 43210" }),
      true,
    );
    expect(await screen.findByText("Ravi added as your primary contact.")).toBeTruthy();
  });

  it("adds later contacts as non-primary", async () => {
    const user = userEvent.setup();
    vi.mocked(load.loadContacts).mockResolvedValue([ravi, asha]);
    render(<ContactsSection profile={profile} initial={[ravi]} />);
    await user.click(screen.getByRole("button", { name: "Add a contact" }));
    await user.type(screen.getByLabelText("Name"), "Asha");
    await user.type(screen.getByLabelText("Phone number"), "9876543211");
    await user.click(screen.getByRole("button", { name: "Add contact" }));
    expect(save.addContact).toHaveBeenCalledWith({}, "p1", expect.anything(), false);
  });

  it("validates before adding", async () => {
    const user = userEvent.setup();
    render(<ContactsSection profile={profile} initial={[]} />);
    await user.click(screen.getByRole("button", { name: "Add a contact" }));
    await user.click(screen.getByRole("button", { name: "Add contact" }));
    expect(save.addContact).not.toHaveBeenCalled();
    expect(screen.getByText("Enter your contact's name.")).toBeTruthy();
  });

  it("edits a contact with its current values filled in", async () => {
    const user = userEvent.setup();
    vi.mocked(load.loadContacts).mockResolvedValue([{ ...ravi, relationship: "Brother" }]);
    render(<ContactsSection profile={profile} initial={[ravi]} />);
    await user.click(screen.getByRole("button", { name: "Edit Ravi" }));
    const name = screen.getByLabelText("Name") as HTMLInputElement;
    expect(name.value).toBe("Ravi");
    await user.type(screen.getByLabelText(/Relationship/), "Brother");
    await user.click(screen.getByRole("button", { name: "Save contact" }));
    expect(save.updateContact).toHaveBeenCalledWith({}, "c1", {
      name: "Ravi",
      phone: "+91 98765 43210",
      relationship: "Brother",
    });
    expect(await screen.findByText("Contact saved.")).toBeTruthy();
  });

  it("makes a contact primary through set_primary_contact and reloads the list", async () => {
    const user = userEvent.setup();
    vi.mocked(load.loadContacts).mockResolvedValue([
      { ...asha, is_primary: true },
      { ...ravi, is_primary: false },
    ]);
    render(<ContactsSection profile={profile} initial={[ravi, asha]} />);
    await user.click(screen.getByRole("button", { name: "Make Asha primary" }));
    expect(save.setPrimaryContact).toHaveBeenCalledWith({}, "c2");
    expect(await screen.findByText("Asha is now your primary contact.")).toBeTruthy();
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]).getByText("Asha")).toBeTruthy();
    expect(within(items[0]).getByText("Primary")).toBeTruthy();
  });

  it("deleting the primary warns first, then names the promoted contact", async () => {
    const user = userEvent.setup();
    vi.mocked(save.deleteContact).mockResolvedValue({ ok: true, data: { promotedId: "c2" } });
    vi.mocked(load.loadContacts).mockResolvedValue([{ ...asha, is_primary: true }]);
    render(<ContactsSection profile={profile} initial={[ravi, asha]} />);

    await user.click(screen.getByRole("button", { name: "Delete Ravi" }));
    expect(screen.getByText(/oldest other contact will become primary/)).toBeTruthy();
    expect(save.deleteContact).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(save.deleteContact).toHaveBeenCalledWith({}, "c1");
    await screen.findByText(/Ravi deleted/);
    expect(status()).toBe("Ravi deleted. Asha is now your primary contact.");
  });

  it("deleting a non-primary contact promotes nobody", async () => {
    const user = userEvent.setup();
    vi.mocked(load.loadContacts).mockResolvedValue([ravi]);
    render(<ContactsSection profile={profile} initial={[ravi, asha]} />);
    await user.click(screen.getByRole("button", { name: "Delete Asha" }));
    expect(screen.queryByText(/will become primary/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    await screen.findByText("Asha deleted.");
  });

  it("can cancel a delete", async () => {
    const user = userEvent.setup();
    render(<ContactsSection profile={profile} initial={[ravi]} />);
    await user.click(screen.getByRole("button", { name: "Delete Ravi" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(save.deleteContact).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete Ravi" })).toBeTruthy();
  });

  it("shows the save error and keeps the list when a save fails", async () => {
    const user = userEvent.setup();
    vi.mocked(save.setPrimaryContact).mockResolvedValue({ ok: false, error: "No connection." });
    render(<ContactsSection profile={profile} initial={[ravi, asha]} />);
    await user.click(screen.getByRole("button", { name: "Make Asha primary" }));
    expect((await screen.findByRole("alert")).textContent).toBe("No connection.");
    expect(load.loadContacts).not.toHaveBeenCalled();
    expect(within(screen.getAllByRole("listitem")[0]).getByText("Primary")).toBeTruthy();
  });
});
