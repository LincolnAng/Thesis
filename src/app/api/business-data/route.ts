import { NextRequest, NextResponse } from "next/server";
import { entriesCollection } from "@/lib/sheets/entries";
import { productsCollection, recipesCollection } from "@/lib/sheets/products";
import { rawMaterialsCollection } from "@/lib/sheets/raw-materials";
import { suppliersCollection, supplierPriceHistoryCollection } from "@/lib/sheets/suppliers";
import { budgetsCollection } from "@/lib/sheets/budgets";
import { eventsCollection, eventStockCollection } from "@/lib/sheets/events";
import { machinesCollection } from "@/lib/sheets/machines";
import { supplierPricesCollection } from "@/lib/sheets/supplier-prices";
import { businessSettingsCollection } from "@/lib/sheets/business-settings";
import { usersCollection } from "@/lib/sheets/users";
import { activityCollection } from "@/lib/sheets/activity";
import { toPublicProfile } from "@/lib/sheets/users";
import type { SheetCollection } from "@/lib/sheets/collection";
import { requireSession } from "@/lib/auth/session";
import { decideWrite, needsExistingRow, redactForEmployee, type BusinessData } from "@/lib/auth/permissions";
import { assembleProduct, type ProductRow } from "@/lib/store/sheet-shapes";
import { effectiveProductPrice, productCostPerJar, type CostContext } from "@/lib/summary/recipe-cost";

const COLLECTIONS = {
  entries: entriesCollection,
  products: productsCollection,
  recipes: recipesCollection,
  rawMaterials: rawMaterialsCollection,
  suppliers: suppliersCollection,
  supplierPriceHistory: supplierPriceHistoryCollection,
  budgets: budgetsCollection,
  events: eventsCollection,
  eventStock: eventStockCollection,
  machines: machinesCollection,
  supplierPrices: supplierPricesCollection,
  businessSettings: businessSettingsCollection,
  users: usersCollection,
  activity: activityCollection,
} as const;

type CollectionName = keyof typeof COLLECTIONS;

function isCollectionName(value: unknown): value is CollectionName {
  return typeof value === "string" && value in COLLECTIONS;
}

/**
 * Everything the app shows, for whoever is signed in. Executives get it all; employees get
 * the redacted copy from lib/auth/permissions — the filtering happens here, on the server,
 * so a restricted profile can't find costs by watching the network either.
 */
export async function GET() {
  const auth = await requireSession();
  if (auth.denied) return auth.denied;
  try {
    const [entries, products, recipes, rawMaterials, suppliers, supplierPriceHistory, budgets, events, eventStock, machines, supplierPrices, businessSettings, users, activity] =
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
    ]);

    // The cookie says who signed in; the sheet says who they are now. A deleted profile is
    // signed out, and a changed role applies from the next load rather than the next sign-in.
    const me = users.find((u) => u.id === auth.session.userId);
    if (!me) return NextResponse.json({ success: false, reason: "signed_out" }, { status: 401 });

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
    };
    if (me.role === "executive") return NextResponse.json({ success: true, role: me.role, ...data });

    const settings = Object.fromEntries(businessSettings.map((s) => [s.key, s.value]));
    const assembled = products.map((row) => assembleProduct(row, recipes));
    const ctx: CostContext = {
      rawMaterials,
      supplierPrices,
      // Same readings as useCostContext / cacaoUtilizationPct, which live in client modules.
      hourlyLaborRate: Number(settings["hourly_labor_rate"]) || 0,
      cacaoUtilization: Math.min(100, Math.max(1, Number(settings["cacaoUtilizationPct"]) || 100)) / 100,
      entries,
      products: assembled,
    };
    const sellingPrice = (row: ProductRow) => {
      const product = assembled.find((p) => p.id === row.id);
      return product ? effectiveProductPrice(product, productCostPerJar(product, ctx)) : row.standardPrice;
    };
    return NextResponse.json({ success: true, role: me.role, ...redactForEmployee(data, sellingPrice) });
  } catch (err) {
    return NextResponse.json({ success: false, detail: err instanceof Error ? err.message : String(err) });
  }
}

interface MutationBody {
  collection?: string;
  op?: "append" | "update" | "delete" | "migrate";
  id?: string;
  item?: unknown;
  items?: unknown[];
}

export async function POST(req: NextRequest) {
  let body: MutationBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, reason: "invalid_request" }, { status: 400 });
  }

  if (!isCollectionName(body.collection)) {
    return NextResponse.json({ success: false, reason: "unknown_collection" }, { status: 400 });
  }
  const collection = COLLECTIONS[body.collection] as SheetCollection<unknown>;

  const auth = await requireSession();
  if (auth.denied) return auth.denied;
  const { session } = auth;

  try {
    const op = body.op;
    if (op !== "append" && op !== "update" && op !== "delete" && op !== "migrate") {
      return NextResponse.json({ success: false, reason: "unknown_op" }, { status: 400 });
    }
    let existing: Record<string, unknown> | undefined;
    if (body.id && needsExistingRow(session.role, body.collection, op)) {
      const rows = (await collection.getAll()) as Record<string, unknown>[];
      existing = rows.find((row) => row.id === body.id);
    }
    const decision = decideWrite({
      role: session.role,
      user: { id: session.userId, name: session.name },
      collection: body.collection,
      op,
      item: body.item as Record<string, unknown> | undefined,
      existing,
    });
    if (!decision.allow) {
      return NextResponse.json({ success: false, reason: decision.reason }, { status: 403 });
    }
    if (decision.item) body.item = decision.item;

    switch (op) {
      case "append":
        if (!body.item) return NextResponse.json({ success: false, reason: "missing_item" }, { status: 400 });
        await collection.append(body.item);
        break;
      case "update":
        if (!body.id || !body.item) {
          return NextResponse.json({ success: false, reason: "missing_fields" }, { status: 400 });
        }
        await collection.update(body.id, body.item);
        break;
      case "delete":
        if (!body.id) return NextResponse.json({ success: false, reason: "missing_id" }, { status: 400 });
        await collection.softDelete(body.id);
        break;
      case "migrate":
        if (!Array.isArray(body.items)) {
          return NextResponse.json({ success: false, reason: "missing_items" }, { status: 400 });
        }
        await collection.appendMany(body.items);
        break;
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    // Logged so a failed save shows up in the server log, not just as a silent 502.
    console.error(`[business-data] ${body.op} ${body.collection} failed:`, err);
    return NextResponse.json(
      { success: false, detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
