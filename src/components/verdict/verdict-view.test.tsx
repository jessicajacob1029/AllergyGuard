// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { checkAllergens } from "@/lib/allergen/check";
import { VerdictView, type VerdictProduct } from "./verdict-view";

afterEach(cleanup);

const MILK = [{ kind: "predefined" as const, code: "milk" as const }];
const product: VerdictProduct = { found: true, name: "Choco bar", brands: "Acme", barcode: "3017620422003" };
const checkedAt = "2026-10-26T10:30:00.000Z";

function renderResult(text: string | null, opts = {}, p: VerdictProduct | null = product) {
  const result = checkAllergens(text, MILK, opts);
  render(<VerdictView result={result} product={p} checkedAt={checkedAt} actions={<a href="/scan">Scan another</a>} />);
  return result;
}

describe("VerdictView", () => {
  it.each([
    ["Sugar, whey", "Unsafe"],
    ["Sugar. May contain milk.", "Caution"],
    ["Sugar, cocoa", "Safe"],
  ])("%j shows the word %s as the heading, with an icon", (text, word) => {
    renderResult(text);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe(word);
    // The icon sits right above the heading, decorative because the word is there.
    expect(heading.closest("div")!.parentElement!.parentElement!.querySelector("svg")).not.toBeNull();
  });

  it("shows the explanation and what triggered it", () => {
    const result = renderResult("Sugar, whey");
    expect(screen.getByText(result.explanation)).toBeTruthy();
    const triggers = within(screen.getByRole("list", { name: "What triggered it" }));
    expect(triggers.getByText(/Milk: “whey”/)).toBeTruthy();
  });

  it("always shows the raw ingredient text, with matches marked", () => {
    renderResult("Sugar, _whey_ powder. May contain milk.");
    const marks = [...document.querySelectorAll("mark")].map((m) => m.textContent);
    expect(marks).toEqual(["whey", "milk"]);
    expect(screen.getByText(/Solid underline: your allergen/)).toBeTruthy();
    expect(document.body.textContent).toContain("Sugar, _whey_ powder. May contain milk.");
  });

  it("hides an allergen-list pill that repeats what the text already showed", () => {
    renderResult("Sugar, whey", { declared: { contains: ["milk"], mayContain: [] } });
    const triggers = within(screen.getByRole("list", { name: "What triggered it" }));
    expect(triggers.getAllByRole("listitem")).toHaveLength(1);
    expect(triggers.getByText(/Milk: “whey”/)).toBeTruthy();
  });

  it("labels allergens that came from the product's allergen list", () => {
    renderResult("sugar, palm oil", { declared: { contains: ["milk"], mayContain: [] } });
    expect(screen.getByText(/Milk: “milk” \(allergen list\)/)).toBeTruthy();
  });

  it("explains a product that isn't on Open Food Facts, and it is Caution", () => {
    renderResult(null, {}, { found: false, name: null, brands: null, barcode: "5000000000000" });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Caution");
    expect(screen.getByText("Product not found")).toBeTruthy();
    expect(screen.getByText(/isn't on Open Food Facts/)).toBeTruthy();
    expect(screen.getByText("No ingredient text was available.")).toBeTruthy();
  });

  it("shows when it was checked and the disclaimer", () => {
    renderResult("Sugar");
    expect(screen.getByText(/Checked against your allergies on/)).toBeTruthy();
    expect(screen.getByText(/aid, not medical advice/)).toBeTruthy();
  });
});

describe("VerdictView for a label photo", () => {
  const result = checkAllergens("Sugar, whey", MILK, { ocrConfidence: 90 });

  it("titles the text card and shows no product card", () => {
    render(
      <VerdictView result={result} product={null} checkedAt={checkedAt} textLabel="Text read from your photo" actions={null} />,
    );
    expect(screen.getByText("Text read from your photo")).toBeTruthy();
    expect(screen.queryByText(/Barcode/)).toBeNull();
    expect(screen.queryByText(/Open Food Facts/)).toBeNull();
  });

  it("shows the original OCR text only when the user edited it", () => {
    render(
      <VerdictView result={result} product={null} checkedAt={checkedAt} originalText={"Sugar, wh3y"} actions={null} />,
    );
    expect(screen.getByText(/You edited this text/)).toBeTruthy();
    expect(screen.getByText("Sugar, wh3y")).toBeTruthy();
    cleanup();
    render(<VerdictView result={result} product={null} checkedAt={checkedAt} actions={null} />);
    expect(screen.queryByText(/You edited this text/)).toBeNull();
  });
});
