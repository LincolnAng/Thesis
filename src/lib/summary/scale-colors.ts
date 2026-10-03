/**
 * The one place the red-to-green ramps live.
 *
 * Season runs on seven rungs and confidence on five, but they sit side by side in the same
 * table row, so their middles have to be the same colour — otherwise an ordinary month and a
 * middling confidence would look like different kinds of fact. NEUTRAL is that shared middle:
 * season rung 4 and confidence rung 3.
 *
 * These are plain hex rather than Tailwind classes because both scales are indexed at runtime,
 * and Tailwind cannot see a class name that is built from a variable.
 */

/** Season rung 4 and confidence rung 3. Dark enough to read as 11px bold text on white. */
export const NEUTRAL = "#746E63";

/**
 * Index 0 is unused; rungs are 1-7 so the number in the UI is the index.
 *
 * These carry WHITE text on a filled badge, which rules out the pastels you would otherwise
 * reach for at rungs 3 and 5: white on a light red measured 2.0:1, which is a colour you can
 * see and a word you cannot read. Every rung here clears 3:1 against white. The ramp therefore
 * runs deepest at the extremes and lighter towards the middle, which still reads correctly —
 * the further a month is from ordinary, the louder it looks.
 */
export const SEASON_COLORS = [
  "",
  "#A3160E", // 1 VERY LEAN — deepest red        7.8:1
  "#C62C20", // 2 LEAN                           5.6:1
  "#DC5A4C", // 3 SLIGHTLY LEAN — lightest red   3.7:1
  NEUTRAL, //   4 NORMAL                         5.1:1
  "#4E9A63", // 5 SLIGHTLY STRONG — lightest green 3.4:1
  "#2E8B4E", // 6 STRONG                         4.3:1
  "#0E7A3A", // 7 VERY STRONG — deepest green    5.4:1
] as const;

/** Index 0 is unused; rungs are 1-5. */
export const CONFIDENCE_COLORS = [
  "",
  "#D92D20", // 1 red
  "#E2685C", // 2 slightly red
  NEUTRAL, //   3 the same middle as an ordinary month
  "#94C9A0", // 4 light green
  "#12A150", // 5 bright green
] as const;

/** Nothing on the scale at all — no history, so no claim either way. */
export const EMPTY = "#D9D4CB";

export function seasonColor(score: number): string {
  return SEASON_COLORS[Math.min(7, Math.max(1, score))];
}

export function confidenceColor(bars: number): string {
  if (bars <= 0) return EMPTY;
  return CONFIDENCE_COLORS[Math.min(5, bars)];
}
