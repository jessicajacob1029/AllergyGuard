import { describe, expect, it, vi } from "vitest";
import { CONTACT_EMAIL, fetchProduct, parseProduct, productUrl, USER_AGENT } from "./open-food-facts";

// Shaped like the live API (v2) response for Nutella on 2026-10-26.
const nutella = {
  code: "3017620422003",
  status: 1,
  status_verbose: "product found",
  product: {
    code: "3017620422003",
    product_name: "Nutella",
    brands: "Nutella, Ferrero",
    lang: "en",
    ingredients_text: "sugar, palm oil",
    ingredients_text_en: "sugar, palm oil",
    allergens_tags: ["en:milk", "en:nuts", "en:soybeans"],
    traces_tags: [],
    states_tags: ["en:to-be-completed", "en:ingredients-completed"],
    last_modified_t: 1792487392,
  },
};

describe("parseProduct", () => {
  it("reads name, brands, English ingredients and declared allergens", () => {
    expect(parseProduct(nutella)).toEqual({
      found: true,
      name: "Nutella",
      brands: "Nutella, Ferrero",
      ingredientsText: "sugar, palm oil",
      incomplete: false,
      notes: [],
      declared: { contains: ["milk", "nuts", "soybeans"], mayContain: [] },
      lastModified: new Date(1792487392 * 1000).toISOString(),
    });
  });

  it("turns multi-word tags into plain names", () => {
    const r = parseProduct({
      status: 1,
      product: {
        ...nutella.product,
        allergens_tags: ["en:sesame-seeds", "en:sulphur-dioxide-and-sulphites"],
        traces_tags: ["en:peanuts"],
      },
    });
    expect(r.found && r.declared).toEqual({
      contains: ["sesame seeds", "sulphur dioxide and sulphites"],
      mayContain: ["peanuts"],
    });
  });

  it("reports a product that isn't on Open Food Facts", () => {
    expect(parseProduct({ code: "5000000000000", status: 0, status_verbose: "product not found" })).toEqual({
      found: false,
    });
  });

  it("prefers the English ingredient text", () => {
    const r = parseProduct({
      status: 1,
      product: { lang: "fr", ingredients_text: "sucre, lait", ingredients_text_en: "sugar, milk" },
    });
    expect(r.found && r.ingredientsText).toBe("sugar, milk");
    expect(r.found && r.incomplete).toBe(false);
  });

  it("uses non-English text but marks it incomplete, so it can never be Safe", () => {
    const r = parseProduct({ status: 1, product: { lang: "fr", ingredients_text: "sucre, lait écrémé" } });
    expect(r.found && r.ingredientsText).toBe("sucre, lait écrémé");
    expect(r.found && r.incomplete).toBe(true);
    expect(r.found && r.notes).toContain("The ingredient list isn't in English, so some words may not be recognised.");
  });

  it("has no ingredient text when the product has none", () => {
    const r = parseProduct({ status: 1, product: { product_name: "Mystery bar", ingredients_text: "  " } });
    expect(r.found && r.ingredientsText).toBeNull();
  });

  it("marks ingredients that Open Food Facts says are still to be completed", () => {
    const r = parseProduct({
      status: 1,
      product: { lang: "en", ingredients_text: "sugar", states_tags: ["en:ingredients-to-be-completed"] },
    });
    expect(r.found && r.incomplete).toBe(true);
  });

  it("marks allergen tags it can't read (not in English) as incomplete", () => {
    const r = parseProduct({
      status: 1,
      product: { lang: "en", ingredients_text: "sugar", allergens_tags: ["en:milk", "fr:lait-de-chevre"] },
    });
    expect(r.found && r.declared.contains).toEqual(["milk"]);
    expect(r.found && r.incomplete).toBe(true);
  });

  it("copes with missing or odd fields", () => {
    const r = parseProduct({ status: 1, product: { allergens_tags: "milk", product_name: 42 } });
    expect(r).toMatchObject({ found: true, name: null, ingredientsText: null, declared: { contains: [], mayContain: [] } });
  });
});

describe("fetchProduct", () => {
  const ok = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

  it("asks for only the fields it needs, with an identifying User-Agent", async () => {
    const fetchImpl = vi.fn(() => ok(nutella));
    const r = await fetchProduct("3017620422003", { fetchImpl });
    expect(r).toMatchObject({ ok: true, product: { found: true, name: "Nutella" } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(productUrl("3017620422003"));
    expect(url).toContain("fields=");
    expect(new Headers(init.headers).get("User-Agent")).toMatch(/^AllergyGuard\//);
  });

  it("names the app, its version, the site and a contact in the User-Agent", () => {
    expect(USER_AGENT).toBe(`AllergyGuard/1.0 (https://allergy-guard-nine.vercel.app; ${CONTACT_EMAIL})`);
  });

  it("reports 'too many requests' separately, so callers can stop", async () => {
    const r = await fetchProduct("3017620422003", { fetchImpl: () => ok({ error: "slow down" }, 429) });
    expect(r).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("treats a 404 as 'not found', not as an error", async () => {
    const r = await fetchProduct("5000000000000", { fetchImpl: () => ok({ status: 0 }, 404) });
    expect(r).toEqual({ ok: true, product: { found: false } });
  });

  it("reports a network failure", async () => {
    const r = await fetchProduct("3017620422003", { fetchImpl: () => Promise.reject(new TypeError("fetch failed")) });
    expect(r).toEqual({ ok: false, reason: "network" });
  });

  it("reports a server error", async () => {
    const r = await fetchProduct("3017620422003", { fetchImpl: () => ok({ error: "down" }, 503) });
    expect(r).toEqual({ ok: false, reason: "bad_response" });
  });

  it("gives up after the timeout", async () => {
    const hang = (_url: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    const r = await fetchProduct("3017620422003", { fetchImpl: hang, timeoutMs: 20 });
    expect(r).toEqual({ ok: false, reason: "timeout" });
  });
});
