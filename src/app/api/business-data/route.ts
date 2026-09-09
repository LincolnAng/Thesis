import { NextRequest, NextResponse } from "next/server";
import { entriesCollection } from "@/lib/sheets/entries";
import { productsCollection, recipesCollection } from "@/lib/sheets/products";
import { rawMaterialsCollection } from "@/lib/sheets/raw-materials";
import { suppliersCollection, supplierPriceHistoryCollection } from "@/lib/sheets/suppliers";
import { socialStatsCollection } from "@/lib/sheets/marketing";
import { budgetsCollection } from "@/lib/sheets/budgets";
import type { SheetCollection } from "@/lib/sheets/collection";

const COLLECTIONS = {
  entries: entriesCollection,
  products: productsCollection,
  recipes: recipesCollection,
  rawMaterials: rawMaterialsCollection,
  suppliers: suppliersCollection,
  supplierPriceHistory: supplierPriceHistoryCollection,
  socialStats: socialStatsCollection,
  budgets: budgetsCollection,
} as const;

type CollectionName = keyof typeof COLLECTIONS;

function isCollectionName(value: unknown): value is CollectionName {
  return typeof value === "string" && value in COLLECTIONS;
}

export async function GET() {
  try {
    const [entries, products, recipes, rawMaterials, suppliers, supplierPriceHistory, socialStats, budgets] = await Promise.all([
      entriesCollection.getAll(),
      productsCollection.getAll(),
      recipesCollection.getAll(),
      rawMaterialsCollection.getAll(),
      suppliersCollection.getAll(),
      supplierPriceHistoryCollection.getAll(),
      socialStatsCollection.getAll(),
      budgetsCollection.getAll(),
    ]);
    return NextResponse.json({
      success: true,
      entries,
      products,
      recipes,
      rawMaterials,
      suppliers,
      supplierPriceHistory,
      socialStats,
      budgets,
    });
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

  try {
    switch (body.op) {
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
      default:
        return NextResponse.json({ success: false, reason: "unknown_op" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
