/**
 * How long stock will actually last — selling it, or keeping it, whichever runs out first.
 *
 * "24 jars — enough for about 104 weeks" was arithmetically correct and practically useless.
 * It divided stock by a one-jar-a-month sales rate and reported two years of cover, for a
 * product that keeps for ninety days. Every one of those jars but three will be in the bin.
 *
 * Two limits bind a shelf, and the app was only ever looking at one:
 *
 *   SALES  — how long until she sells out. The question "do I need to make more?"
 *   EXPIRY — how long until it stops being sellable. The question "did I make too much?"
 *
 * Whichever is shorter is the real answer. When expiry binds first, the surplus is not cover,
 * it is loss that has already happened and has not been noticed yet, so it is counted in jars
 * rather than left as a comfortable-looking green bar.
 *
 * Pure on purpose: no store, no React, so the arithmetic can be tested on its own.
 */

const WEEKS_PER_MONTH = 4.33;

/** Which limit bites first. */
export type ShelfLimit = "sales" | "expiry" | "unknown";

export interface ShelfOutlook {
  /** Weeks until she sells out at the current rate. Null with no sales history to project. */
  weeksOfCover: number | null;
  /** Weeks until stock made today stops being sellable. */
  shelfLifeWeeks: number;
  /** Jars she is unlikely to sell before they pass their best-before. */
  jarsAtRisk: number;
  /** What she can realistically expect to sell within the shelf life. */
  sellableInTime: number;
  limitedBy: ShelfLimit;
  /** Cover, capped at shelf life — the honest figure to show. Null when unknown. */
  realWeeks: number | null;
}

export function shelfOutlook(
  stockQty: number,
  monthlyDemand: number,
  shelfLifeDays: number,
): ShelfOutlook {
  const shelfLifeWeeks = Math.max(0, shelfLifeDays) / 7;

  // No sales history means no projection. Say nothing rather than divide by zero and call the
  // result cover — but expiry still applies, so everything on the shelf is at risk.
  if (!(monthlyDemand > 0)) {
    return {
      weeksOfCover: null,
      shelfLifeWeeks,
      jarsAtRisk: Math.max(0, Math.round(stockQty)),
      sellableInTime: 0,
      limitedBy: "unknown",
      realWeeks: null,
    };
  }

  const weekly = monthlyDemand / WEEKS_PER_MONTH;
  const weeksOfCover = stockQty / weekly;
  const sellableInTime = weekly * shelfLifeWeeks;
  const jarsAtRisk = Math.max(0, Math.round(stockQty - sellableInTime));

  return {
    weeksOfCover,
    shelfLifeWeeks,
    jarsAtRisk,
    sellableInTime,
    limitedBy: jarsAtRisk > 0 ? "expiry" : "sales",
    realWeeks: Math.min(weeksOfCover, shelfLifeWeeks),
  };
}

/**
 * How much of what she holds is surplus, as a share. Used to colour the shelf: a product that
 * will lose most of its stock should not read as comfortably green.
 */
export function wasteShare(outlook: ShelfOutlook, stockQty: number): number {
  if (stockQty <= 0) return 0;
  return Math.min(1, outlook.jarsAtRisk / stockQty);
}
