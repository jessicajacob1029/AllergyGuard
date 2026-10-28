// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const checkBarcode = vi.hoisted(() => vi.fn());
vi.mock("./actions", () => ({ checkBarcode }));

import { Scanner } from "./scanner";

beforeEach(() => checkBarcode.mockReset());
afterEach(cleanup);

const input = () => screen.getByLabelText("Barcode number");

/** A lookup the test settles itself (React waits for pending transitions on cleanup). */
function deferred() {
  let resolve!: (value: { error: string }) => void;
  const promise = new Promise<{ error: string }>((r) => (resolve = r));
  return { promise, resolve };
}
const submit = () => screen.getByRole("button", { name: "Check product" });

describe("Scanner manual entry", () => {
  it("rejects an invalid barcode without looking it up", async () => {
    const user = userEvent.setup();
    render(<Scanner />);
    await user.type(input(), "3017620422004");
    await user.click(submit());
    expect(screen.getByText(/doesn't add up/)).toBeTruthy();
    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(checkBarcode).not.toHaveBeenCalled();
  });

  it("looks up a valid barcode, with spaces removed, as a manual entry", async () => {
    const lookup = deferred();
    checkBarcode.mockReturnValue(lookup.promise);
    const user = userEvent.setup();
    render(<Scanner />);
    await user.type(input(), "3017 6204 22003");
    await user.click(submit());
    expect(checkBarcode).toHaveBeenCalledWith("3017620422003", "manual");
    expect(await screen.findByText("Looking up 3017620422003…")).toBeTruthy();
    lookup.resolve({ error: "done" });
    await screen.findByRole("alert");
  });

  it("shows a lookup failure with Try again, and retries the same barcode", async () => {
    checkBarcode.mockResolvedValueOnce({ error: "We couldn't reach the product database." });
    const user = userEvent.setup();
    render(<Scanner />);
    await user.type(input(), "3017620422003");
    await user.click(submit());
    expect((await screen.findByRole("alert")).textContent).toContain("couldn't reach the product database");

    checkBarcode.mockResolvedValueOnce({ error: "Still down." });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(checkBarcode).toHaveBeenLastCalledWith("3017620422003", "manual");
    expect((await screen.findByRole("alert")).textContent).toContain("Still down.");
  });

  it("offers the camera and a link to check a label photo", () => {
    render(<Scanner />);
    expect(screen.getByRole("button", { name: /Open camera/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Photo of the ingredients/ }).getAttribute("href")).toBe("/scan/label");
  });
});
