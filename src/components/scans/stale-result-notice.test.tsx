// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { STALE_WARNING } from "@/lib/products/stale-result";
import { StaleResultNotice } from "./stale-result-notice";

afterEach(cleanup);

const base = {
  checkedAt: "2026-10-28T10:00:00Z",
  savedVerdict: "safe" as const,
  currentHref: "/scans/s1",
  savedHref: "/scans/s1?saved=1",
};

describe("StaleResultNotice", () => {
  it("current (the default for barcode scans): explains, and shows the saved verdict as 'At the time of scanning'", () => {
    render(<StaleResultNotice {...base} mode="current" />);
    expect(screen.getByRole("heading", { name: "Checked with your current allergies" })).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/At the time of scanning:\s*Safe/);
    expect(text).toContain("wasn't looked up again");
    expect(screen.getByRole("link", { name: "Show the result from the time of scanning" }).getAttribute("href")).toBe("/scans/s1?saved=1");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("saved (on request): the out-of-date warning, and a way back to the current result", () => {
    render(<StaleResultNotice {...base} mode="saved" />);
    expect(screen.getByRole("alert").textContent).toContain(STALE_WARNING);
    expect(STALE_WARNING).toBe("Your allergies have changed since this check. This result may be out of date.");
    expect(screen.getByRole("link", { name: "Show it with my current allergies" }).getAttribute("href")).toBe("/scans/s1");
  });

  it("recheck_needed (label photo / pasted text): the warning and 'Scan the label again', no re-check link", () => {
    render(<StaleResultNotice {...base} mode="recheck_needed" />);
    expect(screen.getByRole("alert").textContent).toContain(STALE_WARNING);
    expect(screen.queryByRole("link", { name: /current allergies/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Scan the label again" }).getAttribute("href")).toBe("/scan");
  });
});
