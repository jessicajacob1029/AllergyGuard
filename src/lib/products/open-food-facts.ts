// Open Food Facts lookup (Phase 4). Runs on the server: OFF asks clients to
// send an identifying User-Agent, which browsers don't allow. Data is ODbL;
// the verdict screen shows the attribution. No matching happens here: this
// only prepares inputs for checkAllergens().

const FIELDS = [
  "code",
  "product_name",
  "brands",
  "lang",
  "ingredients_text",
  "ingredients_text_en",
  "allergens_tags",
  "traces_tags",
  "states_tags",
  "last_modified_t",
].join(",");

/** Open Food Facts asks apps for a name, a version and a contact, so they can reach us instead of blocking us. */
export const CONTACT_EMAIL = "jessicajacob1029@gmail.com";
export const USER_AGENT = `AllergyGuard/1.0 (https://allergy-guard-nine.vercel.app; ${CONTACT_EMAIL})`;
const DEFAULT_TIMEOUT_MS = 8000;

export type Product = {
  found: true;
  name: string | null;
  brands: string | null;
  /** Ingredient text to check, or null when OFF has none. */
  ingredientsText: string | null;
  /** True when the data may be missing ingredients or allergens: never Safe. */
  incomplete: boolean;
  /** Plain-language reasons for `incomplete`, shown on the verdict screen. */
  notes: string[];
  /** English allergen names from OFF's tags, for checkAllergens({ declared }). */
  declared: { contains: string[]; mayContain: string[] };
  lastModified: string | null;
};

export type ProductLookup = Product | { found: false };

export type FetchResult =
  | { ok: true; product: ProductLookup }
  | { ok: false; reason: "network" | "timeout" | "bad_response" | "rate_limited" };

const NOT_ENGLISH = "The ingredient list isn't in English, so some words may not be recognised.";
const TO_BE_COMPLETED = "Open Food Facts says this product's ingredient list is still being completed.";
const UNREADABLE_TAGS = "Some of this product's allergen information isn't in English.";

export function productUrl(barcode: string): string {
  return `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}?fields=${FIELDS}`;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** "en:sesame-seeds" → "sesame seeds". Tags in other languages can't be read. */
function tagNames(tags: string[]): { names: string[]; unreadable: boolean } {
  const names: string[] = [];
  let unreadable = false;
  for (const tag of tags) {
    if (tag.startsWith("en:")) names.push(tag.slice(3).replace(/-/g, " "));
    else unreadable = true;
  }
  return { names, unreadable };
}

/** Turns an API v2 response into what the scan flow needs. Pure. */
export function parseProduct(json: unknown): ProductLookup {
  const body = (json ?? {}) as { status?: unknown; product?: unknown };
  if (body.status !== 1 || typeof body.product !== "object" || body.product === null) {
    return { found: false };
  }
  const p = body.product as Record<string, unknown>;
  const notes: string[] = [];

  let ingredientsText = str(p.ingredients_text_en);
  if (!ingredientsText) {
    ingredientsText = str(p.ingredients_text);
    if (ingredientsText && p.lang !== "en") notes.push(NOT_ENGLISH);
  }
  if (strings(p.states_tags).includes("en:ingredients-to-be-completed")) notes.push(TO_BE_COMPLETED);

  const allergens = tagNames(strings(p.allergens_tags));
  const traces = tagNames(strings(p.traces_tags));
  if (allergens.unreadable || traces.unreadable) notes.push(UNREADABLE_TAGS);

  const modified = typeof p.last_modified_t === "number" ? new Date(p.last_modified_t * 1000).toISOString() : null;

  return {
    found: true,
    name: str(p.product_name),
    brands: str(p.brands),
    ingredientsText,
    incomplete: notes.length > 0,
    notes,
    declared: { contains: allergens.names, mayContain: traces.names },
    lastModified: modified,
  };
}

/** Looks a (validated) barcode up on Open Food Facts. Never throws. */
export async function fetchProduct(
  barcode: string,
  { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<FetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(productUrl(barcode), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    // OFF answers an unknown barcode with 404 and { status: 0 }.
    if (response.status === 404) return { ok: true, product: { found: false } };
    // Too many requests: callers should stop and try later.
    if (response.status === 429) return { ok: false, reason: "rate_limited" };
    if (!response.ok) return { ok: false, reason: "bad_response" };
    return { ok: true, product: parseProduct(await response.json()) };
  } catch (error) {
    if (controller.signal.aborted) return { ok: false, reason: "timeout" };
    if (error instanceof SyntaxError) return { ok: false, reason: "bad_response" };
    return { ok: false, reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}
