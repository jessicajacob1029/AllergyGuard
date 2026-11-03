// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { STALE_WARNING } from "@/lib/products/stale-result";
import { StaleResultNotice } from "./stale-result-notice";

afterEach(cleanup);

const base = { checkedAt: "2026-10-28T10:00:00Z", savedVerdict: "safe" as const, savedHref: "/scans/s1" };

describe("StaleResultNotice", () => {
  it("warns at the top and offers a re-check with the current allergies", () => {
    render(<StaleResultNotice {...base} recheckedVerdict={null} recheckHref="/scans/s1?recheck=1" />);
    expect(screen.getByRole("alert").textContent).toContain(STALE_WARNING);
    expect(STALE_WARNING).toBe("Your allergies have changed since this check. This result may be out of date.");
    expect(screen.getByRole("link", { name: "Re-check with my current allergies" }).getAttribute("href")).toBe("/scans/s1?recheck=1");
  });

  it("label photos can't be re-checked from saved data: asks to scan again", () => {
    render(<StaleResultNotice {...base} recheckedVerdict={null} recheckHref={null} />);
    expect(screen.queryByRole("link", { name: /Re-check/ })).toBeNull();
    expect(screen.getByText(/Scan the label again/)).toBeTruthy();
  });

  it("after the re-check: saved verdict → new verdict, says nothing was looked up, links back", () => {
    render(<StaleResultNotice {...base} recheckedVerdict="unsafe" recheckHref="/scans/s1?recheck=1" />);
    expect(screen.getByRole("heading", { name: "Re-checked with your current allergies" })).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Safe.*Now.*Unsafe/);
    expect(text).toContain("wasn't looked up again");
    expect(screen.getByRole("link", { name: "Show the saved result" }).getAttribute("href")).toBe("/scans/s1");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
