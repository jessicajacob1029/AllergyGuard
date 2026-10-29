// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ScanListRow } from "@/lib/products/scan-list";
import { ScanHistoryView } from "./scan-history-view";

afterEach(cleanup);

const scans: ScanListRow[] = [
  { id: "s1", input: "manual", barcode: "8901262010016", product_name: "Amul butter", brands: "Amul", verdict: "unsafe", created_at: "2026-10-29T03:20:00Z" },
  { id: "s2", input: "camera", barcode: "8901030865237", product_name: "Ketchup", brands: null, verdict: "safe", created_at: "2026-10-28T12:00:00Z" },
];

describe("ScanHistoryView", () => {
  it("has All / Safe / Caution / Unsafe filters as links, marking the current one", () => {
    render(<ScanHistoryView scans={scans} verdict="unsafe" />);
    const filters = within(screen.getByRole("navigation", { name: "Filter by verdict" }));
    const links = filters.getAllByRole("link");
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["All", "/scans"],
      ["Safe", "/scans?verdict=safe"],
      ["Caution", "/scans?verdict=caution"],
      ["Unsafe", "/scans?verdict=unsafe"],
    ]);
    expect(filters.getByRole("link", { name: "Unsafe" }).getAttribute("aria-current")).toBe("page");
    expect(filters.getByRole("link", { name: "All" }).getAttribute("aria-current")).toBeNull();
  });

  it("marks All when there is no filter", () => {
    render(<ScanHistoryView scans={scans} verdict={null} />);
    const filters = within(screen.getByRole("navigation", { name: "Filter by verdict" }));
    expect(filters.getByRole("link", { name: "All" }).getAttribute("aria-current")).toBe("page");
  });

  it("lists scans newest first, each opening its result with the verdict in words", () => {
    render(<ScanHistoryView scans={scans} verdict={null} />);
    const list = within(screen.getByRole("region", { name: "Scans, newest first" }));
    const rows = list.getAllByRole("link");
    expect(rows.map((a) => a.getAttribute("href"))).toEqual(["/scans/s1", "/scans/s2"]);
    expect(rows[0].textContent).toContain("Unsafe");
    expect(rows[1].textContent).toContain("Safe");
    // Each row shows when it was checked.
    expect(rows[0].querySelector("time")?.getAttribute("dateTime")).toBe("2026-10-29T03:20:00Z");
  });

  it("explains an empty history and an empty filter, with a way to scan", () => {
    render(<ScanHistoryView scans={[]} verdict={null} />);
    expect(screen.getByText("No scans yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Scan a product" }).getAttribute("href")).toBe("/scan");
    cleanup();
    render(<ScanHistoryView scans={[]} verdict="caution" />);
    expect(screen.getByText("No Caution results.")).toBeTruthy();
  });
});
