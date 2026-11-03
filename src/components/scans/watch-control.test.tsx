// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const setWatching = vi.hoisted(() => vi.fn(async () => ({ error: null as string | null })));
vi.mock("@/app/(main)/scans/actions", () => ({ setWatching }));

import { WatchControl } from "./watch-control";

const SCAN = "11111111-1111-4111-8111-111111111111";
const WATCH = "22222222-2222-4222-8222-222222222222";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WatchControl", () => {
  it("watching: explains the weekly check and offers Stop watching", async () => {
    const user = userEvent.setup();
    render(<WatchControl scanId={SCAN} watchId={WATCH} watching note={null} alertsEnabled />);
    expect(screen.getByRole("heading", { name: "Watching for changes" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Stop watching" }));
    const form = setWatching.mock.calls[0] as unknown as [unknown, FormData];
    expect(Object.fromEntries(form[1].entries())).toEqual({ scanId: SCAN, watchId: WATCH, watching: "false" });
  });

  it("stopped: offers Watch for changes", () => {
    render(<WatchControl scanId={SCAN} watchId={WATCH} watching={false} note={null} alertsEnabled />);
    expect(screen.getByRole("heading", { name: "Not watching this product" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Watch for changes" })).toBeTruthy();
  });

  it("says when alerts are off in the profile, and shows the missing-data note", () => {
    render(
      <WatchControl scanId={SCAN} watchId={WATCH} watching note="Open Food Facts no longer has this product. Check the packet." alertsEnabled={false} />,
    );
    expect(screen.getByText(/alerts are off in your profile/)).toBeTruthy();
    expect(screen.getByText(/no longer has this product/)).toBeTruthy();
  });

  it("shows a save error", async () => {
    const user = userEvent.setup();
    setWatching.mockResolvedValueOnce({ error: "Couldn't save that. Check your connection and try again." });
    render(<WatchControl scanId={SCAN} watchId={WATCH} watching note={null} alertsEnabled />);
    await user.click(screen.getByRole("button", { name: "Stop watching" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn't save/);
  });
});
