// Tidies text read from a label photo (Phase 5) before the user sees it in the
// editable box. Pure. This is NOT matching: the user can change the result, and
// checkAllergens() still decides the verdict. Joins only lines the label wrapped
// for space; every other line break is kept (keeping one errs towards Unsafe).

// Words that can't end a phrase, so the line must continue ("traces of⏎peanuts").
const CONNECTORS = new Set(["of", "and", "or", "with", "from", "in", "contain", "contains", "including"]);

export function joinOcrLines(text: string): string {
  // Split but keep each line break ("\n" or "\r\n") so we can put it back unchanged.
  const parts = text.split(/(\r?\n)/);
  let out = "";
  let line = parts[0];

  for (let i = 1; i < parts.length; i += 2) {
    const lineBreak = parts[i];
    const next = parts[i + 1];
    const prev = line.trimEnd();
    const nextStart = next.trimStart();

    // Blank line = new paragraph: never join.
    if (prev === "" || nextStart === "") {
      out += line + lineBreak;
      line = next;
      continue;
    }
    // "glu-⏎ten" → "gluten" (only a letter right before the hyphen).
    // "Milk-⏎free" keeps its hyphen: it's a free-from claim, not one word.
    if (/\p{L}-$/u.test(prev)) {
      line = /^free(?!\p{L})/iu.test(nextStart) ? prev + nextStart : prev.slice(0, -1) + nextStart;
      continue;
    }
    // "Sugar,⏎milk" → "Sugar, milk"
    if (prev.endsWith(",") && /^\p{Ll}/u.test(nextStart)) {
      line = prev + " " + nextStart;
      continue;
    }
    // "Emulsifier (⏎soy" → "Emulsifier (soy"
    if (/[([]$/.test(prev)) {
      line = prev + nextStart;
      continue;
    }
    // "traces of⏎peanuts": next starts lowercase AND previous ends on a connector.
    // "nuts⏎milk" stays split, because "nuts" can end a phrase and milk may be a real ingredient.
    const lastWord = prev.match(/\p{L}+$/u)?.[0].toLowerCase();
    if (/^\p{Ll}/u.test(nextStart) && lastWord && CONNECTORS.has(lastWord)) {
      line = prev + " " + nextStart;
      continue;
    }
    // Anything else: keep the original line break.
    out += line + lineBreak;
    line = next;
  }
  return out + line;
}