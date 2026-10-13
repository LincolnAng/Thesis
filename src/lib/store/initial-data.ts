import type { Entry, Product, RawMaterialStock, Supplier } from "./types";

function daysAgo(n: number): string {
  const d = new Date("2026-07-10T09:00:00.000Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

/**
 * No sample products or sample sales. The three spreads that used to ship here (Classic, Dark,
 * Crunch) were retired from the real catalogue in the redesign, and a reset or a brand-new
 * device shouldn't bring them, or sales nobody made, back.
 */
export const initialProducts: Product[] = [];

export const initialRawMaterials: RawMaterialStock[] = [
  { id: "rm-cocoa", name: "Cocoa beans", unit: "kg", qty: 18, lowStockThreshold: 10, perBatchQty: 2, color: null, unitCost: 225 },
  { id: "rm-jars", name: "Jars", unit: "pcs", qty: 65, lowStockThreshold: 30, perBatchQty: 40, color: null, unitCost: 12 },
  { id: "rm-labels", name: "Labels", unit: "pcs", qty: 90, lowStockThreshold: 30, perBatchQty: 40, color: null, unitCost: 3 },
  { id: "rm-oil", name: "Oil", unit: "L", qty: 6, lowStockThreshold: 4, perBatchQty: 1, color: null, unitCost: 120 },
  { id: "rm-sugar", name: "Sugar", unit: "kg", qty: 9, lowStockThreshold: 5, perBatchQty: 1.5, color: null, unitCost: 100 },
  {
    id: "rm-crunch-mixins",
    name: "Crunch mix-ins",
    unit: "kg",
    qty: 5,
    lowStockThreshold: 2,
    perBatchQty: 1,
    color: null,
    unitCost: 200,
  },
];

export const initialSuppliers: Supplier[] = [
  {
    id: "sup-palengke",
    name: "Aling Nena's Market Stall",
    type: "raw_materials",
    items: "Cocoa beans, sugar",
    lastPrice: 90,
    priceHistory: [
      { date: daysAgo(60), price: 82 },
      { date: daysAgo(30), price: 85 },
      { date: daysAgo(5), price: 90 },
    ],
    contact: "0917-555-0142",
  },
  {
    id: "sup-jars",
    name: "Manila Glass & Jar Co.",
    type: "packaging",
    items: "Glass jars, lids",
    lastPrice: 12,
    priceHistory: [
      { date: daysAgo(60), price: 11 },
      { date: daysAgo(20), price: 12 },
    ],
    contact: "0918-555-0033",
  },
  {
    id: "sup-labels",
    name: "Quick Print Labels",
    type: "packaging",
    items: "Printed labels",
    lastPrice: 3,
    priceHistory: [{ date: daysAgo(45), price: 3 }],
    contact: "0919-555-0087",
  },
];


export const initialEntries: Entry[] = [];
