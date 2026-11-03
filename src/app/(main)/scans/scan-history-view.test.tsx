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

describe("ScanHistoryView: product change alerts (Phase 8)", () => {
  const alert = {
    id: "a1",
    barcode: "8901030865237",
    productName: "Ketchup",
    summary: 'now lists milk (in "whey")',
    newVerdict: "unsafe" as const,
    createdAt: "2026-11-01T03:00:00Z",
  };

  it("shows a banner linking to each changed product, and badges its rows", () => {
    render(<ScanHistoryView scans={scans} verdict={null} alerts={[alert]} />);
    const banner = within(screen.getByRole("region", { name: "1 product you scanned has changed" }));
    const link = banner.getByRole("link");
    expect(link.getAttribute("href")).toBe("/scans/changes/a1");
    expect(link.textContent).toContain('Open Food Facts now lists milk (in "whey").');
    expect(link.textContent).toContain("Unsafe");

    const rows = within(screen.getByRole("region", { name: "Scans, newest first" })).getAllByRole("link");
    expect(rows[0].textContent).not.toContain("Changed since");
    expect(rows[1].textContent).toContain("Changed since");
  });

  it("shows nothing extra without unseen alerts", () => {
    render(<ScanHistoryView scans={scans} verdict={null} />);
    expect(screen.queryByText(/you scanned (has|have) changed/)).toBeNull();
    expect(screen.queryByText("Changed since")).toBeNull();
  });

  it("counts several changed products", () => {
    render(<ScanHistoryView scans={scans} verdict={null} alerts={[alert, { ...alert, id: "a2", barcode: "8901262010016" }]} />);
    expect(screen.getByRole("heading", { name: "2 products you scanned have changed" })).toBeTruthy();
  });
});

describe("ScanHistoryView: results older than the latest allergy change", () => {
  it("shows the CURRENT verdict pill, with what it was when scanned", () => {
    const rows = [{ ...scans[1], current: { shown: "unsafe" as const, saved: "safe" as const, outOfDate: true } }];
    render(<ScanHistoryView scans={rows} verdict={null} />);
    const row = within(screen.getByRole("region", { name: "Scans, newest first" })).getByRole("link");
    expect(row.textContent).toContain("Unsafe");
    expect(row.textContent).not.toMatch(/(^|[^s])Safe(?! when)/);
    expect(row.textContent).toContain("Was Safe when scanned");
  });

  it("no note when the re-check gives the same verdict", () => {
    const rows = [{ ...scans[0], current: { shown: "unsafe" as const, saved: "unsafe" as const, outOfDate: true } }];
    render(<ScanHistoryView scans={rows} verdict={null} />);
    expect(screen.queryByText(/when scanned/)).toBeNull();
  });

  it("a label photo that can't be re-checked shows a grey 'Re-check needed' pill, never Safe", () => {
    const photo = { id: "p1", input: "photo", barcode: null, product_name: null, brands: null, verdict: "safe" as const, created_at: "2026-10-27T10:00:00Z" };
    render(<ScanHistoryView scans={[{ ...photo, current: { shown: "recheck_needed" as const, saved: "safe" as const, outOfDate: true } }]} verdict={null} />);
    const row = within(screen.getByRole("region", { name: "Scans, newest first" })).getByRole("link");
    expect(row.textContent).toContain("Re-check needed");
    expect(row.textContent).toContain("Was Safe when scanned");
  });
});
