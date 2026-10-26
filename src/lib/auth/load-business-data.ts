import { entriesCollection } from "@/lib/sheets/entries";
import { productsCollection, recipesCollection } from "@/lib/sheets/products";
import { rawMaterialsCollection } from "@/lib/sheets/raw-materials";
import { suppliersCollection, supplierPriceHistoryCollection } from "@/lib/sheets/suppliers";
import { budgetsCollection } from "@/lib/sheets/budgets";
import { eventsCollection, eventStockCollection } from "@/lib/sheets/events";
import { machinesCollection } from "@/lib/sheets/machines";
import { supplierPricesCollection } from "@/lib/sheets/supplier-prices";
import { businessSettingsCollection } from "@/lib/sheets/business-settings";
import { usersCollection, toPublicProfile } from "@/lib/sheets/users";
import { activityCollection } from "@/lib/sheets/activity";
import { payrollCollection, staffCollection, timeRecordsCollection } from "@/lib/sheets/payroll";
import { calendarItemsCollection } from "@/lib/sheets/calendar-items";
import { stockTransfersCollection } from "@/lib/sheets/stock-transfers";
import { tingiCollection } from "@/lib/sheets/tingi";
import { cacaoBucketCollection, productionRunsCollection } from "@/lib/sheets/production";
import { redactForEmployee, visibleCalendarItems, type BusinessData } from "@/lib/auth/permissions";
import { assembleProduct, type ProductRow } from "@/lib/store/sheet-shapes";
import { effectiveProductPrice, productCostPerJar, type CostContext } from "@/lib/summary/recipe-cost";
import type { Session } from "@/lib/auth/session";
import type { Role } from "@/lib/store/types";

/**
 * Everything in the shop's sheet, as the signed-in profile is allowed to see it — server only.
 * The one place that reads and filters it, used by /api/business-data (the app) and
 * /api/agent (the assistant), so the assistant can never see more than the person asking.
 *
 * Returns null when the session's profile no longer exists (deleted on another device).
 */
export async function loadBusinessDataFor(session: Session): Promise<{ role: Role; data: BusinessData } | null> {
  const [entries, products, recipes, rawMaterials, suppliers, supplierPriceHistory, budgets, events, eventStock, machines, supplierPrices, businessSettings, users, activity, staff, timeRecords, payroll, calendarItems, stockTransfers, tingi, productionRuns, cacaoBucket] =
    await Promise.all([
      entriesCollection.getAll(),
      productsCollection.getAll(),
      recipesCollection.getAll(),
      rawMaterialsCollection.getAll(),
      suppliersCollection.getAll(),
      supplierPriceHistoryCollection.getAll(),
      budgetsCollection.getAll(),
      eventsCollection.getAll(),
      eventStockCollection.getAll(),
      machinesCollection.getAll(),
      supplierPricesCollection.getAll(),
      businessSettingsCollection.getAll(),
      usersCollection.getAll(),
      activityCollection.getAll(),
      staffCollection.getAll(),
      timeRecordsCollection.getAll(),
      payrollCollection.getAll(),
      calendarItemsCollection.getAll(),
      stockTransfersCollection.getAll(),
      tingiCollection.getAll(),
      productionRunsCollection.getAll(),
      cacaoBucketCollection.getAll(),
    ]);

  // The cookie says who signed in; the sheet says who they are now. A deleted profile is
  // signed out, and a changed role applies from the next load rather than the next sign-in.
  const me = users.find((u) => u.id === session.userId);
  if (!me) return null;

  const data: BusinessData = {
    entries,
    products,
    recipes,
    rawMaterials,
    suppliers,
    supplierPriceHistory,
    budgets,
    events,
    eventStock,
    machines,
    supplierPrices,
    businessSettings,
    users: users.map(toPublicProfile),
    activity,
    staff,
    timeRecords,
    payroll,
    // Everyone, Executives included, sees only their own and what was shared with them.
    calendarItems: visibleCalendarItems(calendarItems, me.id),
    stockTransfers,
    tingi,
    productionRuns,
    cacaoBucket,
  };
  if (me.role === "executive") return { role: me.role, data };

  const ctx = costContextOf(data);
  const sellingPrice = (row: ProductRow) => {
    const product = ctx.products.find((p) => p.id === row.id);
    return product ? effectiveProductPrice(product, productCostPerJar(product, ctx)) : row.standardPrice;
  };
  return { role: me.role, data: redactForEmployee(data, sellingPrice, me.id, me.role) };
}

/** The cost chain's inputs, built from sheet rows (the client builds the same in useCostContext). */
export function costContextOf(data: BusinessData): CostContext {
  const settings = Object.fromEntries(data.businessSettings.map((s) => [s.key, s.value]));
  return {
    rawMaterials: data.rawMaterials,
    supplierPrices: data.supplierPrices as CostContext["supplierPrices"],
    // Same readings as useCostContext / cacaoUtilizationPct, which live in client modules.
    hourlyLaborRate: Number(settings["hourly_labor_rate"]) || 0,
    cacaoUtilization: Math.min(100, Math.max(1, Number(settings["cacaoUtilizationPct"]) || 100)) / 100,
    entries: data.entries,
    products: data.products.map((row) => assembleProduct(row, data.recipes)),
  };
}
