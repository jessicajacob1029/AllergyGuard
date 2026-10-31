// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signInWithOAuth } }) }));

import { GoogleButton } from "./google-button";

beforeEach(() => {
  signInWithOAuth.mockReset().mockReturnValue(new Promise(() => {})); // browser is "leaving"
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});
afterEach(cleanup);

describe("GoogleButton", () => {
  it("says Continue with Google, with the G logo hidden from screen readers", () => {
    render(<GoogleButton />);
    const button = screen.getByRole("button", { name: "Continue with Google" });
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("starts Google sign-in back to /auth/callback with the safe next", async () => {
    const user = userEvent.setup();
    render(<GoogleButton next="/scans" />);
    await user.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=%2Fscans` },
    });
    expect(screen.getByRole("button", { name: "Opening Google…" }).hasAttribute("disabled")).toBe(true);
  });

  it("explains a failure and lets you try again", async () => {
    signInWithOAuth.mockResolvedValueOnce({ error: { message: "provider down" } });
    const user = userEvent.setup();
    render(<GoogleButton />);
    await user.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't open Google sign-in/);
    expect(screen.getByRole("button", { name: "Continue with Google" }).hasAttribute("disabled")).toBe(false);
  });

  it("doesn't try when offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const user = userEvent.setup();
    render(<GoogleButton />);
    await user.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(signInWithOAuth).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/offline/);
  });
});
