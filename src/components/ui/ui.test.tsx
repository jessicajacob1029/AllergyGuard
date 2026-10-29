// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { AppBar } from "./app-bar";
import { BottomTabs } from "./bottom-tabs";
import { PasswordToggle } from "./field";
import { ComingSoon, Pill } from "./pill";

vi.mock("@/components/emergency-card-sync", () => ({ EmergencyCardSync: () => null }));

afterEach(cleanup);

describe("BottomTabs", () => {
  it("links Home and Profile, and marks the current page", () => {
    nav.pathname = "/profile";
    render(<BottomTabs />);
    const tabs = within(screen.getByRole("navigation", { name: "Main" }));
    expect(tabs.getByRole("link", { name: "Home" }).getAttribute("href")).toBe("/");
    const profile = tabs.getByRole("link", { name: "Profile" });
    expect(profile.getAttribute("aria-current")).toBe("page");
    expect(tabs.getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBeNull();
  });

  it("links all four tabs, with no Soon badges left", () => {
    nav.pathname = "/scan";
    render(<BottomTabs />);
    const tabs = within(screen.getByRole("navigation", { name: "Main" }));
    expect(tabs.getAllByRole("link")).toHaveLength(4);
    expect(tabs.getByRole("link", { name: "Scan" }).getAttribute("aria-current")).toBe("page");
    expect(tabs.getByRole("link", { name: "Diary" }).getAttribute("href")).toBe("/diary");
    expect(screen.queryByText("Soon")).toBeNull();
  });

  it("marks Diary as the current tab on every diary screen", () => {
    nav.pathname = "/diary/new";
    render(<BottomTabs />);
    const tabs = within(screen.getByRole("navigation", { name: "Main" }));
    expect(tabs.getByRole("link", { name: "Diary" }).getAttribute("aria-current")).toBe("page");
  });

  it.each(["/onboarding", "/login", "/signup"])("is hidden on %s", (path) => {
    nav.pathname = path;
    render(<BottomTabs />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});

describe("AppBar", () => {
  it("always has the Emergency button as a plain link to /emergency", () => {
    for (const signedIn of [true, false]) {
      render(<AppBar signedIn={signedIn} />);
      const link = screen.getByRole("link", { name: /Emergency/ });
      expect(link.getAttribute("href")).toBe("/emergency");
      cleanup();
    }
  });

  it("shows Log in only when signed out, and never Log out", () => {
    render(<AppBar signedIn={false} />);
    expect(screen.getByRole("link", { name: "Log in" })).toBeTruthy();
    cleanup();
    render(<AppBar signedIn />);
    expect(screen.queryByRole("link", { name: "Log in" })).toBeNull();
    expect(screen.queryByRole("button", { name: /log out/i })).toBeNull();
  });
});

describe("PasswordToggle", () => {
  function Harness() {
    const [shown, setShown] = useState(false);
    return (
      <div className="relative">
        <input aria-label="Password" type={shown ? "text" : "password"} />
        <PasswordToggle shown={shown} onToggle={() => setShown((s) => !s)} />
      </div>
    );
  }

  it("toggles the password between hidden and shown", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("password");
    await user.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("text");
  });
});

describe("Pill", () => {
  it("hides a decorative emoji from screen readers but keeps the text", () => {
    render(<Pill icon="🥜">Peanut</Pill>);
    const pill = screen.getByText("Peanut");
    expect(pill.textContent).toBe("🥜Peanut");
    expect(pill.querySelector("[aria-hidden=true]")?.textContent).toBe("🥜");
  });

  it("ComingSoon says so in words", () => {
    render(<ComingSoon />);
    expect(screen.getByText("Coming soon")).toBeTruthy();
  });
});
