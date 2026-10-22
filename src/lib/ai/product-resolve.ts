import type { Product } from "@/lib/store/types";
import { fullName } from "@/lib/summary/product-sizes";

/**
 * Works out which product someone meant from how they typed it — "table", "tablea 250", "2 jars
 * of tableya" — for BAi's recording tools. People misspell, drop the size, and add words like
 * "products" or "jars", so this is more forgiving than lib/summary/product-match, which matches
 * names the app itself wrote.
 *
 * It never picks at random: when the words fit several products equally (two sizes of Tablea,
 * say) it says so, and BAi asks which one.
 */

export type Resolved =
  | { kind: "one"; product: Product }
  | { kind: "several"; options: Product[] }
  | { kind: "none"; suggestions: Product[] };

// Words that describe how many or what kind of thing, never which product.
const FILLER = new Set([
  "a", "an", "the", "of", "and", "ng", "na", "yung", "ang", "mga",
  "product", "products", "item", "items", "order", "orders",
  "jar", "jars", "pc", "pcs", "piece", "pieces", "pack", "packs", "bottle", "bottles",
  "box", "boxes", "unit", "units", "size", "flavor", "flavour",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/(\d)\s+(g|kg|ml|l|oz|pcs?)\b/g, "$1$2") // "250 g" → "250g"
    .replace(/[^a-z0-9ñ]+/g, " ")
    .split(" ")
    .filter((t) => t && !FILLER.has(t));
}

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** Does a typed word stand for a word in the product's name? Allows a typo or two, and a cut-off. */
function wordFits(typed: string, name: string): boolean {
  if (typed === name) return true;
  // Sizes must match exactly ("250g" isn't "350g"), though "250" may stand for "250g".
  const t = typed.match(/^(\d+(?:\.\d+)?)([a-z]*)$/);
  const n = name.match(/^(\d+(?:\.\d+)?)([a-z]*)$/);
  if (t || n) return Boolean(t && n && t[1] === n[1] && (!t[2] || t[2] === n[2]));
  if (typed.length >= 3 && name.startsWith(typed)) return true;
  const allowed = name.length >= 7 ? 2 : name.length >= 4 ? 1 : 0;
  return allowed > 0 && distance(typed, name) <= allowed;
}

export function resolveProduct(products: Product[], typed: string): Resolved {
  const want = tokens(typed);
  if (want.length === 0) return { kind: "none", suggestions: products.slice(0, 12) };

  const scored = products.map((p) => {
    const words = tokens(`${fullName(p, products)} ${p.name}`);
    // Two words typed as one ("icecream") count too.
    const have = [...words, ...words.slice(1).map((w, i) => words[i] + w)];
    const hits = want.filter((w) => have.some((h) => wordFits(w, h))).length;
    return { p, score: hits / want.length, exact: tokens(fullName(p, products)).join(" ") === want.join(" ") };
  });

  const exact = scored.filter((s) => s.exact);
  if (exact.length === 1) return { kind: "one", product: exact[0].p };

  const best = Math.max(0, ...scored.map((s) => s.score));
  // At least half of what they typed has to be in the name — otherwise it's a guess.
  if (best < 0.5) {
    return { kind: "none", suggestions: scored.filter((s) => s.score > 0).map((s) => s.p).concat(products).filter((p, i, all) => all.indexOf(p) === i).slice(0, 12) };
  }
  const top = scored.filter((s) => s.score === best).map((s) => s.p);
  return top.length === 1 ? { kind: "one", product: top[0] } : { kind: "several", options: top };
}
