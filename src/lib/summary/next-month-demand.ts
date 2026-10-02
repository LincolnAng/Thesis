/**
 * What next month is expected to need: the sales it should turn over, plus any event
 * happening in that month.
 *
 * These were two separate figures. "Expected to sell in November" showed the sales average
 * alone, so a bazaar on the 20th made no difference to whether a product looked covered —
 * you could be told a product was fine while 30 jars of it were already promised. They are
 * one number now, and because the parts are kept alongside it, the page can say what the
 * number is made of rather than asking you to take it on trust.
 *
 * Only events that *start next month* count. An event this month is already past the point
 * where next month's stock answers it, and one in December isn't next month's problem.
 *
 * This is for display and for the low-stock warning. The production plan deliberately keeps
 * sales and events as separate demand lines, because they fall due on different dates —
 * folding them together there would lose the deadlines and double-count the jars.
 */

import type { BusinessEvent, Product } from "@/lib/store/types";
import type { ProductForecast } from "@/lib/summary/forecast";

export interface NextMonthDemand {
  /** From the moving average of past sales. */
  sales: number;
  /** Planned for events starting next month. */
  events: number;
  sales_plus_events: number;
  /** Names of the events contributing, for saying so out loud. */
  eventNames: string[];
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function buildNextMonthDemand({
  products,
  forecasts,
  events,
  eventPlans,
  now = new Date(),
}: {
  products: Product[];
  forecasts: ProductForecast[];
  events: BusinessEvent[];
  eventPlans: Record<string, Record<string, number>>;
  now?: Date;
}): Map<string, NextMonthDemand> {
  const nextKey = monthKey(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  const nextMonthEvents = events.filter(
    (e) => e.status === "open" && e.startDate && e.startDate.slice(0, 7) === nextKey,
  );

  const byProduct = new Map<string, NextMonthDemand>();
  for (const product of products) {
    const sales = forecasts.find((f) => f.productId === product.id)?.forecastQty ?? 0;
    let eventQty = 0;
    const eventNames: string[] = [];
    for (const event of nextMonthEvents) {
      const qty = eventPlans[event.id]?.[product.id] ?? 0;
      if (qty > 0) {
        eventQty += qty;
        eventNames.push(event.name);
      }
    }
    byProduct.set(product.id, {
      sales,
      events: eventQty,
      sales_plus_events: sales + eventQty,
      eventNames,
    });
  }
  return byProduct;
}

/** Every event feeding next month's figure, named once, for the line that explains it. */
export function demandEventNames(demand: Map<string, NextMonthDemand>): string[] {
  return [...new Set([...demand.values()].flatMap((d) => d.eventNames))];
}
