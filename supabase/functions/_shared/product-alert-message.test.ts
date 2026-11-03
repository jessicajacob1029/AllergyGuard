import { describe, expect, it } from "vitest";
import { alertHeadline, DATA_WARNING, productAlertEmail, productAlertPush, type ProductAlertMessage } from "./product-alert-message.ts";

const msg = (over: Partial<ProductAlertMessage> = {}): ProductAlertMessage => ({
  alertId: "abc",
  productName: "Nutella",
  barcode: "3017620422003",
  oldVerdict: "safe",
  newVerdict: "unsafe",
  summary: 'now lists milk (in "whey")',
  explanation: "Not safe: contains Milk (whey).",
  ...over,
});

describe("product alert wording", () => {
  it("says the new verdict when it got worse, and 'another of your allergens' when it didn't", () => {
    expect(alertHeadline(msg())).toBe("Nutella has changed: now Unsafe for you");
    expect(alertHeadline(msg({ oldVerdict: "unsafe" }))).toBe("Nutella has changed: another of your allergens");
  });

  it("names the barcode when Open Food Facts has no name", () => {
    expect(alertHeadline(msg({ productName: "  " }))).toBe(
      "A product you scanned (3017620422003) has changed: now Unsafe for you",
    );
  });

  it("push: what changed, the data warning, and a link to the change page", () => {
    expect(productAlertPush(msg())).toEqual({
      title: "Nutella has changed: now Unsafe for you",
      body: `It now lists milk (in "whey"). ${DATA_WARNING}`,
      tag: "product-alert-abc",
      url: "/scans/changes/abc",
    });
  });

  it("email: before and after, the warning, the link, and a product-alerts-only unsubscribe", () => {
    const e = productAlertEmail(msg(), "https://app.example", "f".repeat(64));
    expect(e.text).toContain("Before: Safe. Now: Unsafe.");
    expect(e.text).toContain(DATA_WARNING);
    expect(e.text).toContain("https://app.example/scans/changes/abc");
    expect(e.text).toContain(`https://app.example/unsubscribe?kind=product-alerts&token=${"f".repeat(64)}`);
    expect(e.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("escapes product data in the HTML email", () => {
    const e = productAlertEmail(msg({ productName: "<b>Bad</b>", summary: 'now lists "x" & <y>' }), "https://app.example", "f".repeat(64));
    expect(e.html).not.toContain("<b>Bad</b>");
    expect(e.html).toContain("&lt;b&gt;Bad&lt;/b&gt;");
    expect(e.html).toContain("&quot;x&quot; &amp; &lt;y&gt;");
  });
});
