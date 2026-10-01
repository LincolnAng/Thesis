/**
 * Matching a typed name against names already on file — the guard against ending up with
 * "Aling Nina" beside "Aling Nena", or a second supplier row for the same shop.
 *
 * Shared by the buyer field and the supplier field so both forgive the same typos; a name
 * that genuinely is new still goes straight through, because the list only ever suggests.
 */

export function nameKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Small edit distance, capped — enough to catch "Aling Nena" vs "Aling Nina". */
export function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = temp;
    }
  }
  return prev[b.length];
}

/**
 * How well an existing name answers what's being typed — lower is better, `Infinity` means
 * "not a match at all". Exact beats prefix beats contains beats a typo's worth of distance.
 */
export function nameScore(query: string, candidate: string): number {
  const q = nameKey(query);
  const key = nameKey(candidate);
  if (key === q) return 0;
  if (key.startsWith(q)) return 1;
  if (key.includes(q)) return 2;
  const distance = editDistance(q, key);
  // Roughly one typo per 4 characters, so short names don't match everything.
  if (distance <= Math.max(1, Math.floor(q.length / 4))) return 3 + distance;
  if (key.split(" ").some((word) => word.startsWith(q))) return 6;
  return Infinity;
}

/** The entries whose name resembles the query, best first. An empty query keeps the order given. */
export function rankByName<T>(query: string, items: T[], nameOf: (item: T) => string, limit = 6): T[] {
  const q = nameKey(query);
  if (!q) return items.slice(0, limit);
  return items
    .map((item) => ({ item, score: nameScore(q, nameOf(item)) }))
    .filter((r) => r.score !== Infinity)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((r) => r.item);
}
