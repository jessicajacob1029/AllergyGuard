// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MedicationRow } from "@/lib/profile/types";
import { MedicationBanner } from "./medication-banner";

const med = (name: string, expiry_date: string | null): MedicationRow => ({ id: name, name, dose: null, expiry_date });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // 00:30 on 1 Nov 2026 on the phone: just after midnight, where UTC would still say 31 Oct in India.
  vi.setSystemTime(new Date(2026, 10, 1, 0, 30));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("MedicationBanner", () => {
  it("shows nothing when no medication is expired or expiring soon", () => {
    const { container } = render(<MedicationBanner medications={[med("EpiPen", "2027-01-01"), med("Cetirizine", null)]} />);
    expect(container.textContent).toBe("");
  });

  it("amber: a medication expiring within 30 days, using the phone's date", () => {
    render(<MedicationBanner medications={[med("EpiPen", "2026-11-06")]} />);
    expect(screen.getByRole("status").textContent).toContain("Your EpiPen expires in 5 days (6 Nov 2026)");
    expect(screen.getByRole("link", { name: "Update medications" }).getAttribute("href")).toBe("/profile#medications");
  });

  it("says 'today' on the expiry date itself", () => {
    render(<MedicationBanner medications={[med("EpiPen", "2026-11-01")]} />);
    expect(screen.getByRole("status").textContent).toContain("Your EpiPen expires today");
  });

  it("red: an expired medication", () => {
    render(<MedicationBanner medications={[med("EpiPen", "2026-10-31")]} />);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain("Your EpiPen expired on 31 Oct 2026");
    expect(banner.className).toContain("bg-unsafe-band");
  });

  it("several: one banner with a count, red if any has expired", () => {
    render(<MedicationBanner medications={[med("EpiPen", "2026-10-01"), med("Cetirizine", "2026-11-20"), med("Inhaler", "2026-11-03")]} />);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain("3 medications need attention");
    expect(banner.textContent).toContain("1 expired, 2 expiring within 30 days.");
    expect(banner.className).toContain("bg-unsafe-band");
  });
});
