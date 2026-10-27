// checkAllergens(): the ONE matching function (CLAUDE.md "Verdicts"). Barcode
// and OCR both call it. Pure: no UI, no network.
//
// Rules, in order of strength:
// - Unsafe: an ingredient matches a user allergen or a synonym of it. Nothing
//   downgrades it; warnings are still reported alongside.
// - Caution: a may-contain / traces / shared-facility warning, an ambiguous
//   term with no stated source, a free-from claim, or doubtful input (missing
//   text, incomplete data, low OCR confidence, no allergens in the profile).
// - Safe: text was obtained, nothing above applies.

import { ALLERGEN_LABELS, type AllergenCode } from "./codes";
import {
  ALLERGEN_EXCLUSIONS,
  ALLERGEN_TERMS,
  AMBIGUOUS_TERMS,
  findSynonymTarget,
  termRegex,
  termSource,
} from "./synonyms";
import { hasReadableText, normalizeIngredientText, originalSlice, type NormalizedText } from "./text";

/** Structurally compatible with AllergenSelection; severity is deliberately not read. */
export type CheckAllergen =
  | { kind: "predefined"; code: AllergenCode }
  | { kind: "custom"; name: string };

export type CheckOptions = {
  /** OCR confidence, 0–100 as reported by Tesseract. Omit for barcode data. */
  ocrConfidence?: number;
  /** Below this the input is doubtful. Default 70. */
  minOcrConfidence?: number;
  /** The source says the ingredient data is incomplete. */
  incomplete?: boolean;
  /**
   * Allergens the product data itself declares, as English names ("milk",
   * "soybeans", "sesame seeds"), e.g. Open Food Facts' allergen and trace
   * tags. Matched with the same synonyms as the text: a declared allergen is
   * Unsafe, a declared trace is Caution. Label photos (OCR) don't have these.
   */
  declared?: { contains: readonly string[]; mayContain: readonly string[] };
};

export type Verdict = "unsafe" | "caution" | "safe";

export type AllergenMatch = {
  /** The user's allergen: "Milk", or a custom name such as "whey". */
  allergen: string;
  /** What matched, normalized: "whey". */
  term: string;
  /** The exact original text, to highlight for the user. */
  text: string;
  kind: "contains" | "may_contain";
  /** Found in the ingredient text, or declared by the product data. */
  source: "ingredients" | "declared";
  /** Range of `text` in rawText; null for declared matches. */
  start: number | null;
  end: number | null;
};

export type CheckWarning =
  | { kind: "missing_text" }
  | { kind: "no_allergens" }
  | { kind: "incomplete" }
  | { kind: "low_confidence"; confidence: number }
  /** An ambiguous term ("lecithin") that may come from this allergen. */
  | { kind: "possible_source"; allergen: string; term: string; text: string }
  /** A "dairy-free" style claim about this allergen. Claims are never proof. */
  | { kind: "free_from_claim"; allergen: string; text: string };

export type CheckResult = {
  verdict: Verdict;
  explanation: string;
  matches: AllergenMatch[];
  warnings: CheckWarning[];
  rawText: string;
};

export const DEFAULT_MIN_OCR_CONFIDENCE = 70;

// ---------------------------------------------------------------------------
// Finding words
// ---------------------------------------------------------------------------

type Target = { label: string; codes: ReadonlySet<AllergenCode>; literal: string | null };

type Occurrence = {
  start: number;
  end: number;
  term: string;
  /** Set for dictionary terms. */
  code: AllergenCode | null;
  /** Set for a custom allergen's own text: index into targets. */
  target: number | null;
};

type Range = { start: number; end: number };

const inside = (inner: Range, outer: Range) => inner.start >= outer.start && inner.end <= outer.end;

function findAll(re: RegExp, text: string): Range[] {
  return [...text.matchAll(re)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
}

function toTargets(allergens: readonly CheckAllergen[]): Target[] {
  return allergens.map((a) => {
    if (a.kind === "predefined") {
      return { label: ALLERGEN_LABELS[a.code], codes: new Set([a.code]), literal: null };
    }
    const label = a.name.replace(/\s+/g, " ").trim();
    const code = findSynonymTarget(label);
    const literal = normalizeIngredientText(label).text.trim();
    return { label, codes: new Set(code ? [code] : []), literal: literal || null };
  });
}

function findOccurrences(text: string, targets: readonly Target[]): Occurrence[] {
  const found: Occurrence[] = [];
  for (const [code, terms] of Object.entries(ALLERGEN_TERMS) as [AllergenCode, readonly string[]][]) {
    const excluded = (ALLERGEN_EXCLUSIONS[code] ?? []).flatMap((phrase) => findAll(termRegex(phrase), text));
    for (const term of terms) {
      for (const r of findAll(termRegex(term), text)) {
        if (!excluded.some((x) => inside(r, x))) found.push({ ...r, term, code, target: null });
      }
    }
  }
  targets.forEach((t, i) => {
    if (!t.literal) return;
    for (const r of findAll(termRegex(t.literal), text)) {
      found.push({ ...r, term: t.literal, code: null, target: i });
    }
  });
  return found.sort((a, b) => a.start - b.start || b.end - a.end);
}

function longestAt(occurrences: readonly Occurrence[], pos: number): Occurrence | null {
  let best: Occurrence | null = null;
  for (const o of occurrences) {
    if (o.start === pos && (!best || o.end > best.end)) best = o;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Free-from claims: "dairy-free", "free from milk, egg and gluten", "no milk",
// "without nuts", "contains no peanuts", "non-dairy", "eggless". A claimed
// word is not an ingredient, but a claim is never proof: it gives Caution, and
// a real ingredient elsewhere still gives Unsafe.
// ---------------------------------------------------------------------------

type Claim = Range & { occurrences: Occurrence[]; codes: AllergenCode[] };

const CLAIM_PREFIX =
  /\b(?:free\s+(?:from|of)|without(?:\s+any)?|contains?\s+no|does\s+not\s+contain|non|no)\b[\s:-]*/g;
const CLAIM_SUFFIX = /^[\s-]*free\b/;
const LIST_JOIN = /^\s*(?:,|&|\/|\band\b|\bor\b|\bnor\b)\s*/;
const LIST_JOIN_BACKWARD = /\s*(?:,|&|\/|\band\b|\bor\b|\bnor\b)\s*$/;
// Words allowed between a claim and the allergen: "no added milk", "no tree nuts".
const QUALIFIER = /^(?:any|added|other|tree|real|cow(?:['’]?s)?)\s+/;
const STANDALONE_CLAIMS: { re: RegExp; code: AllergenCode }[] = [{ re: /\beggless\b/g, code: "egg" }];

function findClaims(text: string, occurrences: readonly Occurrence[]): Claim[] {
  const claims: Claim[] = [];

  for (const m of text.matchAll(CLAIM_PREFIX)) {
    const listed: Occurrence[] = [];
    let pos = m.index + m[0].length;
    for (;;) {
      for (let q = QUALIFIER.exec(text.slice(pos)); q; q = QUALIFIER.exec(text.slice(pos))) pos += q[0].length;
      const occ = longestAt(occurrences, pos);
      if (!occ) break;
      listed.push(occ);
      const join = LIST_JOIN.exec(text.slice(occ.end));
      if (!join) break;
      pos = occ.end + join[0].length;
    }
    if (listed.length > 0) {
      claims.push({ start: m.index, end: listed[listed.length - 1].end, occurrences: listed, codes: [] });
    }
  }

  // "dairy & gluten free": walk back from the word before "free".
  for (const occ of occurrences) {
    const free = CLAIM_SUFFIX.exec(text.slice(occ.end));
    if (!free) continue;
    const listed = [occ];
    for (;;) {
      const before = LIST_JOIN_BACKWARD.exec(text.slice(0, listed[0].start));
      if (!before) break;
      const prev = occurrences.find((o) => o.end === before.index);
      if (!prev) break;
      listed.unshift(prev);
    }
    claims.push({ start: listed[0].start, end: occ.end + free[0].length, occurrences: listed, codes: [] });
  }

  for (const { re, code } of STANDALONE_CLAIMS) {
    for (const r of findAll(re, text)) claims.push({ ...r, occurrences: [], codes: [code] });
  }
  return claims;
}

// ---------------------------------------------------------------------------
// Precautionary spans: from the phrase to the end of its sentence or line.
// The span starts AFTER the phrase, so "made with milk in a factory that
// handles nuts" keeps milk as a real ingredient.
// ---------------------------------------------------------------------------

const PRECAUTION_OPENERS = [
  /\bmay\s+(?:also\s+)?contain\b/g,
  /\btraces?\s+(?:amounts?\s+)?of\b/g,
  /\bnot\s+suitable\s+for\b/g,
  /\b(?:made|produced|manufactured|processed|packed|packaged|prepared|baked)\b[^.;\n]*?\b(?:factory|factories|facility|facilities|site|premises|kitchen|bakery|equipment|line)\b/g,
];
// Ends at a full stop (not a decimal point), ; ! ? or a line break, or where
// a "contains" statement or the ingredient list starts. A line break ends it
// so advice printed above the ingredients can't swallow them.
const PRECAUTION_END = /\.(?!\d)|[;!?\n]|(?<!\bmay\s+(?:also\s+)?)\bcontains?\b|\bingredients?\b/g;

function findPrecautionSpans(text: string): Range[] {
  const spans: Range[] = [];
  for (const opener of PRECAUTION_OPENERS) {
    for (const m of text.matchAll(opener)) {
      const start = m.index + m[0].length;
      const end = new RegExp(PRECAUTION_END.source, "g");
      end.lastIndex = start;
      const stop = end.exec(text);
      spans.push({ start, end: stop ? stop.index : text.length });
    }
  }
  return spans;
}

// ---------------------------------------------------------------------------
// Ambiguous terms: "lecithin", "flour", "vegetable protein".
// ---------------------------------------------------------------------------

const PRECEDING_WORD = /(\p{L}+)[\s-]+$/u;
const FOLLOWING_PARENS = /^\s*\(([^()]*)\)/;

function isAllergenWord(word: string): boolean {
  return Object.values(ALLERGEN_TERMS).some((terms) =>
    terms.some((t) => new RegExp(`^${termSource(t)}$`, "u").test(word)),
  );
}

function mentionsSource(text: string, sources: readonly string[], occurrences: readonly Occurrence[], offset: number) {
  if (sources.some((s) => termRegex(s).test(text))) return true;
  return occurrences.some((o) => o.code && o.start >= offset && o.end <= offset + text.length);
}

type AmbiguousHit = Range & { label: string; possible: readonly AllergenCode[] };

function claimCodes(claim: Claim): AllergenCode[] {
  return [...claim.codes, ...claim.occurrences.flatMap((o) => (o.code ? [o.code] : []))];
}

function findUnsettledAmbiguous(
  text: string,
  occurrences: readonly Occurrence[],
  claims: readonly Claim[],
): AmbiguousHit[] {
  const hits: AmbiguousHit[] = [];
  for (const group of AMBIGUOUS_TERMS) {
    const ranges = group.patterns
      .flatMap((p) => findAll(new RegExp(p.source, "gu"), text))
      .sort((a, b) => a.start - b.start || b.end - a.end);
    let prev: (Range & { settled: boolean }) | null = null;
    for (const r of ranges) {
      if (prev && r.start < prev.end) continue; // "ins 322" and its bare "322"
      let settled: boolean;
      if (prev && /^\s*\(\s*$/.test(text.slice(prev.end, r.start))) {
        // "sunflower lecithin (e322)", "hing (asafoetida)": the same ingredient,
        // already settled or reported.
        prev = { ...r, settled: prev.settled };
        continue;
      } else {
        const word = PRECEDING_WORD.exec(text.slice(0, r.start))?.[1];
        const parens = FOLLOWING_PARENS.exec(text.slice(r.end));
        // "anchovy-free worcestershire sauce": a claim right before it settles it
        // (the claim still gives Caution on its own).
        const claimedBefore = claims.some(
          (c) =>
            c.end <= r.start &&
            /^[\s-]*$/.test(text.slice(c.end, r.start)) &&
            claimCodes(c).some((code) => group.possible.includes(code)),
        );
        settled =
          claimedBefore ||
          (word !== undefined && (group.sources.includes(word) || isAllergenWord(word))) ||
          (parens !== null &&
            mentionsSource(parens[1], group.sources, occurrences, r.end + parens[0].indexOf("(") + 1));
      }
      prev = { ...r, settled };
      if (!settled) hits.push({ ...r, label: group.label, possible: group.possible });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Explanation
// ---------------------------------------------------------------------------

const quote = (s: string) => `“${s.replace(/\s+/g, " ").trim()}”`;

function listText(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function byAllergen(matches: readonly AllergenMatch[]): string {
  // Same word in different case ("wheat", "Wheat") is listed once, as first seen.
  const groups = new Map<string, Map<string, string>>();
  for (const m of matches) {
    const texts = groups.get(m.allergen) ?? new Map<string, string>();
    const key = m.text.toLowerCase();
    if (!texts.has(key)) texts.set(key, quote(m.text));
    groups.set(m.allergen, texts);
  }
  return listText([...groups].map(([allergen, texts]) => `${allergen} (${[...texts.values()].join(", ")})`));
}

function uniqueAllergens(matches: readonly AllergenMatch[]): string[] {
  return [...new Set(matches.map((m) => m.allergen))];
}

function reasonSentences(matches: readonly AllergenMatch[], warnings: readonly CheckWarning[]): string[] {
  const out: string[] = [];
  const mayContain = matches.filter((m) => m.kind === "may_contain");
  const mayText = mayContain.filter((m) => m.source === "ingredients");
  const mayInText = new Set(mayText.map((m) => m.allergen));
  // Only what the text didn't already say.
  const mayDeclared = uniqueAllergens(
    mayContain.filter((m) => m.source === "declared" && !mayInText.has(m.allergen)),
  );
  if (mayText.length) out.push(`The label warns it may contain ${byAllergen(mayText)}.`);
  if (mayDeclared.length) {
    out.push(`The product's allergen list says it may contain ${listText(mayDeclared)}.`);
  }

  // One sentence per phrase, naming every allergen it concerns.
  const claims = new Map<string, string[]>();
  const possible = new Map<string, string[]>();
  for (const w of warnings) {
    if (w.kind === "free_from_claim") {
      claims.set(w.text, [...(claims.get(w.text) ?? []), w.allergen]);
    } else if (w.kind === "possible_source") {
      const reason = AMBIGUOUS_TERMS.find((g) => g.label === w.term)?.reason;
      if (reason) {
        out.push(reason.replace("{text}", quote(w.text)));
        continue;
      }
      const shown = w.text.trim().toLowerCase() === w.term ? quote(w.text) : `${quote(w.text)} (${w.term})`;
      possible.set(shown, [...(possible.get(shown) ?? []), w.allergen]);
    }
  }
  for (const [shown, allergens] of possible) {
    out.push(`${shown} can come from ${allergens.join(" or ")}, and the label doesn't say which source.`);
  }
  for (const [text, allergens] of claims) {
    out.push(`The label says ${quote(text)}, but a claim is not proof for ${listText(allergens)}.`);
  }

  for (const w of warnings) {
    if (w.kind === "missing_text") out.push("No ingredient list was found, so we can't tell if it's safe.");
    if (w.kind === "incomplete") out.push("The ingredient list may be incomplete.");
    if (w.kind === "low_confidence") out.push("The text wasn't read clearly, so compare it with the label.");
    if (w.kind === "no_allergens") out.push("Your profile has no allergens to check against.");
  }
  return [...new Set(out)];
}

function explain(
  verdict: Verdict,
  matches: readonly AllergenMatch[],
  warnings: readonly CheckWarning[],
  targets: readonly Target[],
): string {
  if (verdict === "safe") {
    return (
      `No ingredients matching your allergies (${listText(targets.map((t) => t.label))}) were found. ` +
      "Always read the label to be sure."
    );
  }
  const reasons = reasonSentences(matches, warnings);
  if (verdict === "unsafe") {
    const contains = matches.filter((m) => m.kind === "contains");
    const inText = contains.filter((m) => m.source === "ingredients");
    const foundInText = new Set(inText.map((m) => m.allergen));
    // Declared allergens the ingredient text didn't already show.
    const declaredOnly = uniqueAllergens(
      contains.filter((m) => m.source === "declared" && !foundInText.has(m.allergen)),
    );
    const head = inText.length
      ? [`Not safe for you: it contains ${byAllergen(inText)}.`]
      : [`Not safe for you: the product's allergen list says it contains ${listText(declaredOnly)}.`];
    if (inText.length && declaredOnly.length) {
      head.push(`The product's allergen list also says it contains ${listText(declaredOnly)}.`);
    }
    return [...head, ...reasons].join(" ");
  }
  return ["Check before eating.", ...reasons, "Read the label yourself."].join(" ");
}

// ---------------------------------------------------------------------------
// checkAllergens
// ---------------------------------------------------------------------------

export function checkAllergens(
  ingredientText: string | null | undefined,
  allergens: readonly CheckAllergen[],
  options: CheckOptions = {},
): CheckResult {
  const rawText = ingredientText ?? "";
  const targets = toTargets(allergens);
  // `rank` orders matches: text matches by position, then declared ones.
  const matches: (AllergenMatch & { rank: number; order: number })[] = [];
  const warnings: CheckWarning[] = [];
  const seenWarnings = new Set<string>();
  const warnOnce = (w: CheckWarning) => {
    const key = JSON.stringify(w);
    if (!seenWarnings.has(key)) {
      seenWarnings.add(key);
      warnings.push(w);
    }
  };

  if (!hasReadableText(ingredientText)) warnOnce({ kind: "missing_text" });
  if (targets.length === 0) warnOnce({ kind: "no_allergens" });
  if (options.incomplete) warnOnce({ kind: "incomplete" });
  if (options.ocrConfidence !== undefined) {
    const min = options.minOcrConfidence ?? DEFAULT_MIN_OCR_CONFIDENCE;
    // NaN fails this comparison too, so it counts as low.
    if (!(options.ocrConfidence >= min)) {
      warnOnce({ kind: "low_confidence", confidence: options.ocrConfidence });
    }
  }

  if (hasReadableText(ingredientText) && targets.length > 0) {
    const normalized: NormalizedText = normalizeIngredientText(ingredientText);
    const text = normalized.text;
    const excerpt = (r: Range) => originalSlice(rawText, normalized, r.start, r.end);
    const occurrences = findOccurrences(text, targets);
    const claims = findClaims(text, occurrences);
    const claimed = new Map<Occurrence, Claim>();
    for (const claim of claims) for (const o of claim.occurrences) claimed.set(o, claim);
    const spans = findPrecautionSpans(text);

    targets.forEach((target, ti) => {
      const seen = new Set<number>();
      for (const o of occurrences) {
        const relevant = o.target === ti || (o.code !== null && target.codes.has(o.code));
        if (!relevant || seen.has(o.start)) continue;
        seen.add(o.start);
        const claim = claimed.get(o);
        if (claim) {
          warnOnce({ kind: "free_from_claim", allergen: target.label, text: excerpt(claim) });
          continue;
        }
        matches.push({
          allergen: target.label,
          term: text.slice(o.start, o.end),
          text: excerpt(o),
          kind: spans.some((s) => inside(o, s)) ? "may_contain" : "contains",
          source: "ingredients",
          start: normalized.map[o.start],
          end: normalized.map[o.end - 1] + 1,
          rank: o.start,
          order: ti,
        });
      }
      for (const claim of claims) {
        if (claim.codes.some((code) => target.codes.has(code))) {
          warnOnce({ kind: "free_from_claim", allergen: target.label, text: excerpt(claim) });
        }
      }
      for (const hit of findUnsettledAmbiguous(text, occurrences, claims)) {
        if (!hit.possible.some((code) => target.codes.has(code))) continue;
        // "nut-free" is a claim about peanuts too, not a possible source of them.
        const claim = claims.find((cl) => inside(hit, cl));
        if (claim) {
          warnOnce({ kind: "free_from_claim", allergen: target.label, text: excerpt(claim) });
        } else {
          warnOnce({ kind: "possible_source", allergen: target.label, term: hit.label, text: excerpt(hit) });
        }
      }
    });
  }

  // Declared allergens: each name goes through the same synonyms and
  // ambiguous-term rules as the text ("nuts" may include peanuts).
  if (options.declared && targets.length > 0) {
    const lists = [
      { names: options.declared.contains, kind: "contains" as const },
      { names: options.declared.mayContain, kind: "may_contain" as const },
    ];
    // If the product declares an allergen the ingredient text never mentions,
    // the text is provably incomplete (e.g. Nutella on Open Food Facts lists
    // "sugar, palm oil" but declares milk, nuts and soy): never Safe.
    if (hasReadableText(ingredientText)) {
      const text = normalizeIngredientText(ingredientText).text;
      const inText = new Set(findOccurrences(text, []).map((o) => o.code));
      const missing = options.declared.contains.some((name) => {
        const declaredText = normalizeIngredientText(name).text.trim();
        if (declaredText === "") return false;
        const codes = findOccurrences(declaredText, []).map((o) => o.code);
        return codes.length > 0 ? !codes.some((code) => inText.has(code)) : !termRegex(declaredText).test(text);
      });
      if (missing) warnOnce({ kind: "incomplete" });
    }

    let rank = Number.MAX_SAFE_INTEGER / 2;
    for (const { names, kind } of lists) {
      for (const name of names) {
        if (!hasReadableText(name)) continue;
        rank += 1;
        const text = normalizeIngredientText(name).text;
        const occurrences = findOccurrences(text, targets);
        targets.forEach((target, ti) => {
          const hit = occurrences.some((o) => o.target === ti || (o.code !== null && target.codes.has(o.code)));
          if (hit) {
            matches.push({
              allergen: target.label,
              term: text,
              text: name,
              kind,
              source: "declared",
              start: null,
              end: null,
              rank,
              order: ti,
            });
          }
          for (const amb of findUnsettledAmbiguous(text, occurrences, [])) {
            if (amb.possible.some((code) => target.codes.has(code))) {
              warnOnce({ kind: "possible_source", allergen: target.label, term: amb.label, text: name });
            }
          }
        });
      }
    }
  }

  matches.sort((a, b) => a.rank - b.rank || a.order - b.order);
  const publicMatches: AllergenMatch[] = matches.map((m) => ({
    allergen: m.allergen,
    term: m.term,
    text: m.text,
    kind: m.kind,
    source: m.source,
    start: m.start,
    end: m.end,
  }));
  const verdict: Verdict = publicMatches.some((m) => m.kind === "contains")
    ? "unsafe"
    : publicMatches.length > 0 || warnings.length > 0
      ? "caution"
      : "safe";

  return {
    verdict,
    explanation: explain(verdict, publicMatches, warnings, targets),
    matches: publicMatches,
    warnings,
    rawText,
  };
}
