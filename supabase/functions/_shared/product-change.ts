// Phase 8: has a watched product changed, and is the change worth an alert?
// Pure functions, no Deno or Node APIs. The verdicts come from the ONE
// matching function, checkAllergens() (CLAUDE.md "Verdicts"), imported from
// the app's own file: no second copy of the rules exists.

import { checkAllergens, type CheckAllergen, type CheckResult, type Verdict } from "../../../src/lib/allergen/check.ts";
import { hasReadableText } from "../../../src/lib/allergen/text.ts";

/** One version of a product's data: the saved snapshot, or what Open Food Facts says now. */
export type ProductData = {
  ingredientsText: string | null;
  /** Open Food Facts' allergen tags as English names ("milk"). */
  contains: readonly string[];
  /** Open Food Facts' traces tags as English names. */
  mayContain: readonly string[];
  /** Open Food Facts says the data may be incomplete (or isn't in English). */
  incomplete: boolean;
};

/** Something new in the latest version that concerns one of the user's allergens. */
export type ChangeItem = {
  /** The user's allergen: "Milk", or a custom name. */
  allergen: string;
  kind: "contains" | "may_contain" | "possible_source";
  /** The words in the product data: "whey", or the ambiguous term ("lecithin"). */
  text: string;
};

export type Evaluation =
  /** Same data (spacing, capitals and punctuation don't count). */
  | { outcome: "unchanged" }
  /** Open Food Facts has no ingredient list now: keep the snapshot, no alert. */
  | { outcome: "no_ingredients" }
  /** Worse, but only because the data is now missing or incomplete: keep the snapshot, no alert. */
  | { outcome: "data_incomplete"; before: CheckResult; after: CheckResult }
  /** Different data, not worse for the user: update the snapshot quietly. */
  | { outcome: "improved" | "changed"; before: CheckResult; after: CheckResult }
  /** Worse for the user, or a new allergen of theirs appears: alert. */
  | { outcome: "alert"; before: CheckResult; after: CheckResult; changes: ChangeItem[]; summary: string };

const RANK: Record<Verdict, number> = { safe: 0, caution: 1, unsafe: 2 };

/** Ingredient text for comparing versions: NFKC, lower case, no punctuation or symbols, single spaces. */
export function normalizeForCompare(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((t) => normalizeForCompare(t)).filter((t) => t !== ""))].sort();
}

/** Two versions with the same key are the same data. */
export function dataKey(data: ProductData): string {
  return JSON.stringify([
    normalizeForCompare(data.ingredientsText),
    normalizeTags(data.contains),
    normalizeTags(data.mayContain),
    data.incomplete,
  ]);
}

/** checkAllergens() on one version, exactly as a barcode scan calls it. */
export function checkVersion(data: ProductData, allergens: readonly CheckAllergen[]): CheckResult {
  return checkAllergens(data.ingredientsText, allergens, {
    incomplete: data.incomplete,
    declared: { contains: data.contains, mayContain: data.mayContain },
  });
}

/** What the latest result has that the earlier one didn't. */
export function newChanges(before: CheckResult, after: CheckResult): ChangeItem[] {
  const seen = new Set<string>();
  for (const m of before.matches) seen.add(`${m.allergen.toLowerCase()}|${m.kind}`);
  for (const w of before.warnings) {
    if (w.kind === "possible_source") seen.add(`${w.allergen.toLowerCase()}|possible|${w.term.toLowerCase()}`);
  }

  const changes: ChangeItem[] = [];
  for (const m of after.matches) {
    const key = `${m.allergen.toLowerCase()}|${m.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    changes.push({ allergen: m.allergen, kind: m.kind, text: m.text });
  }
  for (const w of after.warnings) {
    if (w.kind !== "possible_source") continue;
    const key = `${w.allergen.toLowerCase()}|possible|${w.term.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    changes.push({ allergen: w.allergen, kind: "possible_source", text: w.term });
  }
  return changes;
}

function allergensIn(result: CheckResult): Set<string> {
  return new Set(result.matches.map((m) => m.allergen.toLowerCase()));
}

/**
 * Compares the saved snapshot with the latest data, both checked with the
 * user's CURRENT allergens, so a change to the user's own profile is never
 * blamed on the product.
 */
export function evaluateChange(
  snapshot: ProductData,
  latest: ProductData,
  allergens: readonly CheckAllergen[],
): Evaluation {
  if (dataKey(snapshot) === dataKey(latest)) return { outcome: "unchanged" };
  if (!hasReadableText(latest.ingredientsText)) return { outcome: "no_ingredients" };

  const before = checkVersion(snapshot, allergens);
  const after = checkVersion(latest, allergens);
  const changes = newChanges(before, after);
  const worse = RANK[after.verdict] > RANK[before.verdict];
  const earlier = allergensIn(before);
  const newAllergen = changes.some((c) => c.kind !== "possible_source" && !earlier.has(c.allergen.toLowerCase()));

  if ((worse && changes.length > 0) || newAllergen) {
    return { outcome: "alert", before, after, changes, summary: describeChanges(changes) };
  }
  if (worse) {
    // Worse with nothing new about the user's allergens: the data got thinner
    // (now marked incomplete), or a "free from" claim appeared. No alert.
    return { outcome: "data_incomplete", before, after };
  }
  return { outcome: RANK[after.verdict] < RANK[before.verdict] ? "improved" : "changed", before, after };
}

function lower(allergen: string): string {
  return allergen.toLowerCase();
}

function phrase(change: ChangeItem): string {
  const name = lower(change.allergen);
  switch (change.kind) {
    case "contains": {
      const words = change.text.trim();
      return words && words.toLowerCase() !== name ? `lists ${name} (${words})` : `lists ${name}`;
    }
    case "may_contain":
      return `says it may contain ${name}`;
    case "possible_source":
      return `lists ${change.text.trim()}, which may come from ${name}`;
  }
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** "now lists milk (whey) and says it may contain peanut". At most three items. */
export function describeChanges(changes: readonly ChangeItem[]): string {
  if (changes.length === 0) return "has changed";
  const parts = changes.slice(0, 3).map(phrase);
  if (changes.length > 3) parts.push(`${changes.length - 3} more`);
  return `now ${joinList(parts)}`.slice(0, 500);
}
