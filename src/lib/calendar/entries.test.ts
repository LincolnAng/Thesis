import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCalendarEntries, coversDay, type CalendarInput } from "./entries.ts";
import type { Entry, Product } from "@/lib/store/types";

const product = (over: Partial<Product>): Product =>
  ({
    id: "p1", name: "Cacao Tablea", sizeLabel: "150g", standardPrice: 0, pricingMode: "manual", marginPercent: 0, marketPrice: 0,
    friendPrice: 0, wholesalePrice: 0, stockQty: 20, lowStockThreshold: 5, batchYield: 10, unit: "pack",
    recipeIngredients: [], recipeLabor: [], recipeMisc: [], ...over,
  }) as Product;

function input(over: Partial<CalendarInput> = {}): CalendarInput {
  return {
    today: "2026-10-15",
    products: [product({})],
    planDays: [],
    events: [],
    eventPlans: {},
    eventStock: [],
    unavailableDays: [],
    entries: [],
    lotsByProduct: {},
    expiringWithinDays: 7,
    ingredientShortages: [],
    late: [],
    now: new Date(2026, 9, 15),
    ...over,
  };
}

const sale = (over: Partial<Entry>): Entry =>
  ({ id: "e1", timestamp: "2026-10-01T00:00:00Z", type: "SALE", amount: 1000, quantity: 1, unit: null, sku: "Tablea", counterparty: "Aling Nena", location: null, priceType: "standard", category: null, rawText: "", confidence: 1, ...over }) as Entry;

test("an empty shop has an empty calendar — nothing is made up", () => {
  assert.deepEqual(buildCalendarEntries(input({ products: [] })), []);
});

test("suggested production shows per product per day, labelled as suggested", () => {
  const out = buildCalendarEntries(
    input({ planDays: [{ date: "2026-10-20", status: "open", capacity: 2, runs: [{ itemId: "p1", kind: "product", name: "Cacao Tablea", qty: 20, unit: "packs" }], eventNames: [] }] }),
  );
  const prod = out.filter((e) => e.category === "production");
  assert.equal(prod.length, 1);
  assert.equal(prod[0].date, "2026-10-20");
  assert.match(prod[0].title, /Cacao Tablea · 150g/);
  assert.match(prod[0].subtitle ?? "", /suggested/);
});

test("a multi-day event covers each of its days and lists what's planned", () => {
  const [ev] = buildCalendarEntries(
    input({
      events: [{ id: "ev1", name: "Bazaar", kind: "event", startDate: "2026-10-24", endDate: "2026-10-26", status: "open", notes: "", createdAt: "" }],
      eventPlans: { ev1: { p1: 30 } },
    }),
  ).filter((e) => e.category === "events");
  assert.ok(coversDay(ev, "2026-10-25"));
  assert.ok(!coversDay(ev, "2026-10-27"));
  assert.ok(ev.details.some((d) => d.value === "30 packs"));
});

test("open-ended distributors with no date are left off", () => {
  const out = buildCalendarEntries(input({ events: [{ id: "d1", name: "Shop", kind: "distributor", startDate: null, endDate: null, status: "open", notes: "", createdAt: "" }] }));
  assert.equal(out.filter((e) => e.category === "events").length, 0);
});

test("payments show only what is still owed, on the due date, and flag overdue", () => {
  const out = buildCalendarEntries(
    input({
      entries: [
        sale({ id: "r1", paymentTerm: "receivable", dueDate: "2026-10-10", amount: 1000, amountPaid: 400, paymentStatus: "partial" }),
        sale({ id: "r2", paymentTerm: "receivable", dueDate: "2026-10-30", amount: 500, amountPaid: 500, paymentStatus: "settled" }),
        sale({ id: "s1" }),
        sale({ id: "p1", type: "EXPENSE", paymentTerm: "payable", dueDate: "2026-11-02", amount: 300, counterparty: "Mr. Clav" }),
      ],
    }),
  ).filter((e) => e.category === "payments");
  assert.deepEqual(out.map((e) => e.id).sort(), ["payment:p1", "payment:r1"]);
  const r1 = out.find((e) => e.id === "payment:r1")!;
  assert.equal(r1.date, "2026-10-10");
  assert.match(r1.title, /₱600/);
  assert.equal(r1.tone, "bad");
  assert.match(out.find((e) => e.id === "payment:p1")!.title, /To pay/);
});

test("an employee's copy (no payment terms) produces no payments", () => {
  const out = buildCalendarEntries(input({ entries: [sale({ amount: 1000, dueDate: "2026-10-20" })] }));
  assert.equal(out.filter((e) => e.category === "payments").length, 0);
});

test("alerts: low stock today, expiring batches on their date, past-date batches today", () => {
  const out = buildCalendarEntries(
    input({
      products: [product({ stockQty: 3 })],
      lotsByProduct: {
        p1: [
          { madeOn: "2026-07-01", expiresOn: "2026-10-01", qty: 2, daysLeft: -14 },
          { madeOn: "2026-07-20", expiresOn: "2026-10-19", qty: 1, daysLeft: 4 },
          { madeOn: "2026-10-01", expiresOn: "2026-12-30", qty: 5, daysLeft: 76 },
        ],
      },
    }),
  ).filter((e) => e.category === "alerts");
  assert.ok(out.some((e) => e.id === "alert:low:p1" && e.date === "2026-10-15"));
  assert.ok(out.some((e) => e.title.startsWith("Past its date") && e.date === "2026-10-15"));
  assert.ok(out.some((e) => e.title.startsWith("Expires") && e.date === "2026-10-19"));
  assert.equal(out.filter((e) => e.id.startsWith("alert:expiry")).length, 2);
});

test("day-offs and shipments come straight from their records", () => {
  const out = buildCalendarEntries(
    input({
      unavailableDays: ["2026-10-18"],
      events: [{ id: "ev1", name: "Bazaar", kind: "event", startDate: "2026-10-24", endDate: null, status: "open", notes: "", createdAt: "" }],
      eventStock: [{ id: "m1", eventId: "ev1", productId: "p1", type: "sent_out", quantity: 12, createdAt: "2026-10-23T08:00:00Z" }],
    }),
  );
  assert.ok(out.some((e) => e.category === "dayoffs" && e.date === "2026-10-18"));
  const ship = out.find((e) => e.category === "shipments")!;
  assert.equal(ship.date, "2026-10-23");
  assert.match(ship.title, /Sent: 12 packs/);
});

test("event products link to their card in Costing, and alerts to the right Production table", () => {
  const out = buildCalendarEntries(
    input({
      products: [product({ stockQty: 2 })],
      events: [{ id: "ev1", name: "Bazaar", kind: "event", startDate: "2026-10-24", endDate: null, status: "open", notes: "", createdAt: "" }],
      eventPlans: { ev1: { p1: 30, gone: 5 } },
      ingredientShortages: [{ name: "Jars", short: 40, unit: "pcs" }],
    }),
  );
  const ev = out.find((e) => e.category === "events")!;
  assert.equal(ev.details.find((d) => d.value === "30 packs")?.href, "/costing?product=p1");
  assert.equal(ev.details.find((d) => d.value === "5 jars")?.href, "/costing");
  assert.equal(out.find((e) => e.id === "alert:short:Jars")?.href, "/production#what-to-buy");
  assert.equal(out.find((e) => e.id === "alert:low:p1")?.href, "/production#what-to-make");
});

test("leave days in a row show as one leave on the calendar", async () => {
  const { leaveRuns } = await import("./entries.ts");
  const rec = (date: string, note = "Vacation", staffId = "s1") => ({ id: date + staffId, staffId, date, timeIn: null, timeOut: null, status: "leave" as const, otHours: 0, note, createdAt: "" });
  const runs = leaveRuns([rec("2026-10-05"), rec("2026-10-06"), rec("2026-10-07"), rec("2026-10-09"), rec("2026-10-06", "Sick", "s2"), { ...rec("2026-10-08"), status: "present" as const }]);
  assert.deepEqual(runs.map((r) => [r.staffId, r.start, r.end]), [["s1", "2026-10-05", "2026-10-07"], ["s1", "2026-10-09", "2026-10-09"], ["s2", "2026-10-06", "2026-10-06"]]);
});
