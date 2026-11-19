import type { BusinessData } from "@/lib/auth/permissions";
import type { ProductRow, RecipeRow } from "@/lib/store/sheet-shapes";
import type { ActivityEvent, CalendarItem, Entry, OrderLine, PaymentMethod, ProductionRun, RawMaterialStock, StaffMember, TimeRecord } from "@/lib/store/types";
import { DEMO_PROFILES } from "./mode";

/**
 * The made-up business the demo site shows: MKC's product list at its list prices, and
 * everything else invented — customers, sales, expenses, staff, suppliers, costs, the
 * calendar. Built fresh for the visitor's own "today" (about seven months back from it), from a
 * fixed seed, so every visitor sees the same shop and its dates never look stale.
 *
 * Nothing here is read from, or derived from, MKC's records.
 */

/** Small, fast, seedable — the same seed always gives the same shop. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (d: Date, hour: number, minute = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute).toISOString();
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => ymd(a) === ymd(b);

// ---- Catalogue: MKC's products and list prices; stock levels are invented.

interface Item {
  id: string;
  name: string;
  size: string | null;
  sizeOf: string | null;
  unit: string;
  price: number;
  wholesale: number;
  stock: number;
  low: number;
}

const ITEMS: Item[] = [
  { id: "prod-tableya-1kg", name: "MKC Tablea", size: "1 kg", sizeOf: null, unit: "packs", price: 1700, wholesale: 1500, stock: 6, low: 3 },
  { id: "prod-tableya-500g", name: "MKC Tablea", size: "500 g", sizeOf: "prod-tableya-1kg", unit: "packs", price: 850, wholesale: 780, stock: 14, low: 5 },
  { id: "prod-tableya-312g", name: "MKC Tablea", size: "312 g", sizeOf: "prod-tableya-1kg", unit: "packs", price: 650, wholesale: 550, stock: 22, low: 8 },
  { id: "prod-tableya-150g", name: "MKC Tablea", size: "150 g", sizeOf: "prod-tableya-1kg", unit: "packs", price: 350, wholesale: 285, stock: 9, low: 15 },
  { id: "prod-brandy", name: "MKC Brandy", size: null, sizeOf: null, unit: "bottles", price: 650, wholesale: 500, stock: 18, low: 6 },
  { id: "prod-ic-35oz", name: "Tablea Ice Cream", size: "3.5 oz", sizeOf: null, unit: "cups", price: 95, wholesale: 80, stock: 40, low: 20 },
  { id: "prod-ic-pint", name: "Tablea Ice Cream", size: "Pint", sizeOf: "prod-ic-35oz", unit: "pints", price: 295, wholesale: 260, stock: 12, low: 5 },
  { id: "prod-vanilla-ic-35oz", name: "Vanilla Tablea Ice Cream", size: "3.5 oz", sizeOf: null, unit: "cups", price: 95, wholesale: 80, stock: 26, low: 20 },
  { id: "prod-sparkling-juice", name: "Sparkling Cacao Juice", size: null, sizeOf: null, unit: "bottles", price: 350, wholesale: 300, stock: 30, low: 10 },
];
const byId = (id: string) => ITEMS.find((i) => i.id === id)!;
/** The name a sale line is written with — exactly what the app's product matcher looks for. */
const lineName = (i: Item) => (i.size ? `${i.sizeOf ? byId(i.sizeOf).name : i.name} · ${i.size}` : i.name);

const PRODUCTS: ProductRow[] = ITEMS.map((i) => ({
  id: i.id,
  name: i.name,
  standardPrice: i.price,
  pricingMode: "manual",
  marginPercent: 0,
  friendPrice: 0,
  wholesalePrice: i.wholesale,
  stockQty: i.stock,
  lowStockThreshold: i.low,
  batchYield: 1,
  marketPrice: 0,
  laborCostOverride: null,
  unit: i.unit,
  sizeLabel: i.size,
  sizeOfId: i.sizeOf,
  bulkSize: null,
  bulkWord: null,
}));

const MATERIALS: RawMaterialStock[] = [
  ["mat-cacao-beans", "Cacao beans", "kg", 38, 20, 280, "ingredient"],
  ["mat-cacao-pods", "Cacao pods", "pcs", 60, 20, 15, "ingredient"],
  ["mat-sugar", "Sugar", "kg", 12, 5, 75, "ingredient"],
  ["mat-milk", "Milk", "L", 8, 6, 95, "ingredient"],
  ["mat-coconut-milk", "Coconut milk", "L", 5, 3, 85, "ingredient"],
  ["pkg-pouches", "Tablea pouches", "pcs", 180, 100, 6, "packaging"],
  ["pkg-stickers", "Stickers", "pcs", 420, 100, 2, "packaging"],
  ["pkg-bottles", "Glass bottles", "pcs", 30, 40, 22, "packaging"],
  ["pkg-cups", "3.5 oz cups", "pcs", 300, 150, 4, "packaging"],
  ["pkg-pint-tubs", "Pint tubs", "pcs", 40, 20, 15, "packaging"],
].map(([id, name, unit, qty, low, cost, kind]) => ({
  id: id as string,
  name: name as string,
  unit: unit as string,
  qty: qty as number,
  lowStockThreshold: low as number,
  perBatchQty: null,
  color: null,
  unitCost: cost as number,
  kind: kind as RawMaterialStock["kind"],
  reorderPoint: null,
}));

/** Invented recipes, per unit, so Costing has something to show. */
const RECIPE_SPEC: Record<string, { ing?: [string, number][]; labor?: [string, number][]; misc?: [string, number][] }> = {
  "prod-tableya-1kg": { ing: [["mat-cacao-beans", 1.3], ["mat-sugar", 0.05], ["pkg-pouches", 1], ["pkg-stickers", 1]], labor: [["Roasting, grinding & molding", 60]] },
  "prod-tableya-500g": { ing: [["mat-cacao-beans", 0.65], ["pkg-pouches", 1], ["pkg-stickers", 1]], labor: [["Roasting, grinding & molding", 35]] },
  "prod-tableya-312g": { ing: [["mat-cacao-beans", 0.4], ["pkg-pouches", 1], ["pkg-stickers", 1]], labor: [["Roasting, grinding & molding", 25]] },
  "prod-tableya-150g": { ing: [["mat-cacao-beans", 0.2], ["pkg-pouches", 1], ["pkg-stickers", 1]], labor: [["Roasting, grinding & molding", 15]] },
  "prod-brandy": { ing: [["mat-cacao-beans", 0.12], ["mat-cacao-pods", 2], ["mat-sugar", 0.15], ["pkg-bottles", 1], ["pkg-stickers", 1]], misc: [["Base spirit", 120]] },
  "prod-ic-35oz": { ing: [["mat-milk", 0.09], ["mat-sugar", 0.02], ["mat-cacao-beans", 0.015], ["pkg-cups", 1]] },
  "prod-ic-pint": { ing: [["mat-milk", 0.35], ["mat-sugar", 0.08], ["mat-cacao-beans", 0.06], ["pkg-pint-tubs", 1]] },
  "prod-vanilla-ic-35oz": { ing: [["mat-milk", 0.09], ["mat-sugar", 0.02], ["pkg-cups", 1]], misc: [["Vanilla", 5]] },
  "prod-sparkling-juice": { ing: [["mat-cacao-pods", 3], ["mat-sugar", 0.05], ["pkg-bottles", 1], ["pkg-stickers", 1]] },
};
const RECIPES: RecipeRow[] = Object.entries(RECIPE_SPEC).flatMap(([productId, spec], p) => [
  ...(spec.ing ?? []).map(([materialId, quantity], i): RecipeRow => ({ id: `demo-ing-${p}-${i}`, productId, rowType: "ingredient", materialId, label: null, quantity, cost: null })),
  ...(spec.labor ?? []).map(([label, cost], i): RecipeRow => ({ id: `demo-lab-${p}-${i}`, productId, rowType: "labor", materialId: null, label, quantity: null, cost })),
  ...(spec.misc ?? []).map(([label, cost], i): RecipeRow => ({ id: `demo-misc-${p}-${i}`, productId, rowType: "misc", materialId: null, label, quantity: null, cost })),
]);

const SUPPLIERS = [
  { id: "demo-sup-coop", name: "Hillside Cacao Growers Co-op", type: "raw_materials", items: "Cacao beans, cacao pods", lastPrice: 290 },
  { id: "demo-sup-sugar", name: "Sweet Harvest Trading", type: "raw_materials", items: "Sugar, milk", lastPrice: 75 },
  { id: "demo-sup-pack", name: "PackRight Supplies", type: "packaging", items: "Pouches, stickers, cups, bottles", lastPrice: 6 },
];

/** How much busier each month is than usual — the holidays carry the year. */
const SEASON = [0.8, 0.85, 0.9, 0.95, 0.95, 0.9, 0.9, 0.95, 1, 1.05, 1.2, 1.5];

export function buildDemoData(now = new Date()): BusinessData {
  const rand = mulberry32(20261119);
  const r = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const ana = DEMO_PROFILES.executive;
  const ben = DEMO_PROFILES.employee;

  const entries: Entry[] = [];
  let n = 0;
  const base = (d: Date, hour: number): Pick<Entry, "id" | "timestamp" | "location" | "confidence" | "notes" | "eventId" | "payments" | "paymentTerms" | "dueDateHistory" | "defaultedAt" | "installments" | "branch" | "lotId" | "expiresOn" | "packagingUsed" | "fromTingi" | "runId" | "settledAt" | "amountPaid" | "paymentStatus" | "dueDate" | "bankName"> => ({
    id: `demo-e-${++n}`,
    timestamp: at(d, hour, r(0, 59)),
    location: null,
    confidence: 1,
    notes: null,
    eventId: null,
    payments: null,
    paymentTerms: null,
    dueDateHistory: null,
    defaultedAt: null,
    installments: null,
    branch: null,
    lotId: null,
    expiresOn: null,
    packagingUsed: null,
    fromTingi: null,
    runId: null,
    settledAt: null,
    amountPaid: null,
    paymentStatus: null,
    dueDate: null,
    bankName: null,
  });

  function sale(
    d: Date,
    lines: [string, number][],
    opts: { who?: string | null; wholesale?: boolean; method?: PaymentMethod; bank?: string; eventId?: string; location?: string; byEmployee?: boolean; credit?: { days: number; paid: "all" | "part" | "none" } },
  ) {
    const order: OrderLine[] = lines
      .filter(([, q]) => q > 0)
      .map(([id, q]) => {
        const i = byId(id);
        return { productId: id, name: lineName(i), quantity: q, unitPrice: opts.wholesale && i.wholesale ? i.wholesale : i.price };
      });
    if (order.length === 0) return;
    const amount = order.reduce((t, l) => t + l.quantity * l.unitPrice, 0);
    const method = opts.method ?? "cash";
    const e: Entry = {
      ...base(d, r(9, 17)),
      type: "SALE",
      amount,
      quantity: order.reduce((t, l) => t + l.quantity, 0),
      unit: order.length === 1 ? byId(order[0].productId!).unit : "units",
      sku: order.map((l) => l.name).join(", "),
      counterparty: opts.who ?? null,
      location: opts.location ?? null,
      priceType: opts.wholesale ? "wholesale" : "standard",
      category: null,
      rawText: order.map((l) => `${l.quantity} × ${l.name} @ ₱${l.unitPrice}`).join("; "),
      eventId: opts.eventId ?? null,
      loggedById: opts.byEmployee ? ben.id : ana.id,
      loggedByName: opts.byEmployee ? ben.name : ana.name,
      paymentTerm: "spot",
      lineItems: order.length > 1 ? order : null,
      paymentMethod: method,
      bankName: method === "bank_transfer" ? (opts.bank ?? "BPI") : method === "ewallet" ? "GCash" : null,
    };
    if (order.length === 1) e.sku = order[0].name;
    if (opts.credit) {
      const due = addDays(d, opts.credit.days);
      e.paymentTerm = "receivable";
      e.paymentTerms = `net_${opts.credit.days}`;
      e.dueDate = ymd(due);
      const paidOn = addDays(d, Math.min(opts.credit.days, r(5, opts.credit.days)));
      const paidAmount = opts.credit.paid === "all" ? amount : opts.credit.paid === "part" ? Math.round(amount * 0.5) : 0;
      if (paidAmount > 0) {
        e.payments = [{ id: `demo-pay-${n}`, date: ymd(paidOn <= today ? paidOn : today), amount: paidAmount, method, bankName: e.bankName ?? null, note: null }];
      }
      e.amountPaid = paidAmount;
      e.paymentStatus = paidAmount >= amount ? "settled" : paidAmount > 0 ? "partial" : "pending";
      if (e.paymentStatus === "settled") e.settledAt = at(paidOn <= today ? paidOn : today, 15);
    }
    entries.push(e);
  }

  function expense(d: Date, amount: number, what: string, category: string, opts: { who?: string; method?: PaymentMethod; bank?: string; eventId?: string; payable?: { days: number } ; type?: Entry["type"] } = {}) {
    const method = opts.method ?? "cash";
    const e: Entry = {
      ...base(d, r(8, 18)),
      type: opts.type ?? "EXPENSE",
      amount: Math.round(amount),
      quantity: null,
      unit: null,
      sku: what,
      counterparty: opts.who ?? null,
      priceType: null,
      category,
      rawText: `${what} ₱${Math.round(amount)}`,
      eventId: opts.eventId ?? null,
      loggedById: ana.id,
      loggedByName: ana.name,
      paymentTerm: "spot",
      lineItems: null,
      paymentMethod: method,
      bankName: method === "bank_transfer" ? (opts.bank ?? "BPI") : method === "ewallet" ? "GCash" : null,
    };
    if (opts.payable) {
      e.paymentTerm = "payable";
      e.paymentTerms = `net_${opts.payable.days}`;
      e.dueDate = ymd(addDays(d, opts.payable.days));
      e.amountPaid = 0;
      e.paymentStatus = "pending";
    }
    entries.push(e);
  }

  // ---- Events: two past bazaars and one coming up.
  const ev1Start = addDays(start, 52);
  const ev2Start = addDays(today, -40);
  const ev3Start = addDays(today, 12);
  const events = [
    { id: "demo-evt-market", name: "Downtown Weekend Market", kind: "event", startDate: ymd(ev1Start), endDate: ymd(addDays(ev1Start, 1)), status: "closed", notes: "Two-day stall near the plaza.", createdAt: at(addDays(ev1Start, -10), 10) },
    { id: "demo-evt-fair", name: "Regional Food Trade Fair", kind: "event", startDate: ymd(ev2Start), endDate: ymd(addDays(ev2Start, 2)), status: "closed", notes: "Booth 14. Brought tablea, brandy and juice.", createdAt: at(addDays(ev2Start, -14), 10) },
    { id: "demo-evt-holiday", name: "Holiday Bazaar", kind: "event", startDate: ymd(ev3Start), endDate: ymd(addDays(ev3Start, 2)), status: "open", notes: "Bring extra pints and gift sets.", createdAt: at(addDays(today, -6), 10) },
  ];

  // ---- Sales and expenses, day by day.
  const walkIns = ["Liza", "Mark", "Joy", "Rico", "Grace", "Paolo", "Ella", "Nonoy", "Mae", "Jun", "Carmen", "Toto", null, null, null];
  const retailMix: [string, number, number, number][] = [
    // product, weight, min qty, max qty
    ["prod-tableya-150g", 30, 1, 3],
    ["prod-tableya-312g", 14, 1, 2],
    ["prod-tableya-500g", 5, 1, 1],
    ["prod-ic-35oz", 18, 2, 6],
    ["prod-vanilla-ic-35oz", 11, 2, 5],
    ["prod-ic-pint", 6, 1, 2],
    ["prod-brandy", 8, 1, 2],
    ["prod-sparkling-juice", 8, 1, 3],
  ];
  const weightTotal = retailMix.reduce((t, m) => t + m[1], 0);
  const retailLine = (): [string, number] => {
    let x = rand() * weightTotal;
    for (const [id, w, lo, hi] of retailMix) {
      if ((x -= w) <= 0) return [id, r(lo, hi)];
    }
    return ["prod-tableya-150g", 1];
  };

  let nextReseller = addDays(start, 4);
  let nextHotel = addDays(start, 11);
  let nextCafe = addDays(start, 2);
  let nextPasalubong = addDays(start, 17);
  let nextBeans = addDays(start, 1);
  let nextMarketing = addDays(start, 20);

  for (let d = new Date(start); d <= today; d = addDays(d, 1)) {
    const season = SEASON[d.getMonth()];
    const sunday = d.getDay() === 0;
    const daysAgo = Math.round((today.getTime() - d.getTime()) / 864e5);
    const inEvent = (evStart: Date, len: number, id: string) => d >= evStart && d <= addDays(evStart, len - 1) && id;

    // Walk-in and online buyers.
    if (!sunday) {
      const count = Math.floor(rand() * 2.2 * season + (d.getDay() === 6 ? 0.8 : 0));
      for (let k = 0; k < count; k++) {
        const lines = [retailLine(), ...(rand() < 0.3 ? [retailLine()] : [])];
        sale(d, lines, { who: pick(walkIns), method: rand() < 0.62 ? "cash" : "ewallet", byEmployee: rand() < 0.7 });
      }
    }

    // Bazaar days: lots of small sales.
    const ev = inEvent(ev1Start, 2, "demo-evt-market") || inEvent(ev2Start, 3, "demo-evt-fair");
    if (ev) {
      const location = ev === "demo-evt-market" ? "Downtown Weekend Market" : "Regional Food Trade Fair";
      for (let k = 0, m = r(14, 26); k < m; k++) {
        sale(d, [retailLine()], { who: "Bazaar customer", method: rand() < 0.7 ? "cash" : "ewallet", eventId: ev, location, byEmployee: true });
      }
    }

    // A reseller who restocks about monthly, by cheque; lately on 15-day terms.
    if (d >= nextReseller) {
      const credit = daysAgo < 60 ? { days: 15, paid: (daysAgo < 15 ? "part" : "all") as "part" | "all" } : undefined;
      sale(d, [["prod-tableya-150g", Math.round(r(18, 28) * season)], ["prod-tableya-312g", Math.round(r(8, 14) * season)], ["prod-brandy", Math.round(r(4, 8) * season)]], { who: "Sari-Sari Hub", wholesale: true, method: "check", credit });
      nextReseller = addDays(d, r(24, 31));
    }
    // A hotel that buys big for its restaurant, on 30-day terms.
    if (d >= nextHotel) {
      const paid = daysAgo > 30 ? "all" : "none";
      sale(d, [["prod-tableya-1kg", Math.round(r(3, 7) * season)], ["prod-tableya-500g", Math.round(r(5, 10) * season)], ["prod-brandy", Math.round(r(6, 12) * season)]], { who: "Casa Verde Hotel", wholesale: true, method: "bank_transfer", bank: "BDO", credit: { days: 30, paid } });
      nextHotel = addDays(d, r(38, 50));
    }
    // A café that takes ice cream every two weeks.
    if (d >= nextCafe) {
      sale(d, [["prod-ic-pint", r(4, 8)], ["prod-ic-35oz", r(18, 36)], ["prod-vanilla-ic-35oz", r(10, 20)]], { who: "Brew Lane Café", wholesale: true, method: "ewallet", byEmployee: true });
      nextCafe = addDays(d, r(12, 16));
    }
    // A pasalubong shop, monthly.
    if (d >= nextPasalubong) {
      sale(d, [["prod-tableya-150g", Math.round(r(20, 36) * season)], ["prod-tableya-312g", r(6, 12)], ["prod-sparkling-juice", r(8, 14)]], { who: "Kape't Kakaw Pasalubong", wholesale: true, method: "check" });
      nextPasalubong = addDays(d, r(27, 33));
    }

    // Salaries on the 15th and the last day of the month.
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    if (d.getDate() === 15 || d.getDate() === last) {
      const half = d.getDate() === 15 ? "1st half" : "2nd half";
      expense(d, 8000, `Salary – Ben (${half})`, "labor", { who: "Ben", method: "bank_transfer", bank: "BPI" });
      expense(d, 600 * r(11, 13), `Salary – Carla (${half})`, "labor", { who: "Carla" });
      expense(d, 520 * r(10, 13), `Salary – Dong (${half})`, "labor", { who: "Dong" });
    }
    // Beans about every five weeks; the latest delivery not yet paid for.
    if (d >= nextBeans) {
      const kg = r(30, 45);
      const price = r(280, 300);
      expense(d, kg * price, `Cacao beans ${kg} kg`, "raw_materials", { who: "Hillside Cacao Growers Co-op", method: "bank_transfer", bank: "BPI", payable: daysAgo < 10 ? { days: 15 } : undefined });
      nextBeans = addDays(d, r(32, 40));
    }
    if (d.getDate() === 3) expense(d, r(10, 15) * 75, "Sugar", "raw_materials", { who: "Sweet Harvest Trading" });
    if (d.getDay() === 1) expense(d, r(6, 10) * 95, "Milk for ice cream", "raw_materials", { who: "Sweet Harvest Trading" });
    if (d.getDate() === 8) expense(d, r(2200, 3800), "Pouches, stickers and cups", "packaging", { who: "PackRight Supplies", method: "bank_transfer", bank: "BPI", payable: daysAgo < 20 ? { days: 30 } : undefined });
    if (d.getDay() === 4) expense(d, r(150, 450), pick(["Delivery fare", "Tricycle to suppliers", "Courier to Sari-Sari Hub"]), "transport");
    if (d.getDate() === 22) expense(d, r(2800, 3600), "Electricity bill", "misc", { who: "City Power Co.", method: "ewallet" });
    if (d >= nextMarketing) {
      expense(d, r(1200, 2500), pick(["Flyers and price cards", "Facebook page boost", "Product photos"]), "Printing & marketing");
      nextMarketing = addDays(d, r(35, 50));
    }
    if ([0, 3, 6, 9].includes(d.getMonth()) && d.getDate() === 20) expense(d, r(2600, 3400), "Quarterly percentage tax", "Taxes & government", { who: "BIR" });
    if (sameDay(d, addDays(ev1Start, -5))) expense(d, 2500, "Stall fee – Downtown Weekend Market", "events", { eventId: "demo-evt-market" });
    if (sameDay(d, addDays(ev2Start, -7))) expense(d, 4000, "Booth fee – Regional Food Trade Fair", "events", { eventId: "demo-evt-fair", method: "bank_transfer", bank: "BPI" });
    if (daysAgo === 95) expense(d, 18500, "Chest freezer", "equipment", { who: "Appliance Center", type: "ASSET", method: "bank_transfer", bank: "BDO" });
  }

  // A little spoilage, so the waste figures aren't empty.
  for (const [days, id, qty, note] of [
    [130, "prod-ic-35oz", 6, "Freezer door left open overnight"],
    [72, "prod-vanilla-ic-35oz", 4, "Cups cracked in delivery"],
    [33, "prod-tableya-150g", 3, "Past best-before date"],
    [9, "prod-ic-pint", 2, "Melted during brownout"],
  ] as [number, string, number, string][]) {
    const d = addDays(today, -days);
    if (d < start) continue;
    const i = byId(id);
    entries.push({ ...base(d, 16), type: "WASTE", amount: null, quantity: qty, unit: i.unit, sku: lineName(i), counterparty: null, priceType: null, category: null, rawText: `${qty} ${lineName(i)} spoiled`, notes: note, loggedById: ben.id, loggedByName: ben.name, paymentTerm: null, lineItems: null, paymentMethod: null });
  }
  entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // ---- People.
  const staff: StaffMember[] = [
    { id: "demo-stf-ben", name: "Ben", payType: "monthly", rate: 16000, position: "Sales & front desk", pwd: false, userId: ben.id, startDate: ymd(addDays(start, -120)), active: true, allowanceOnly: false, createdAt: at(start, 9) },
    { id: "demo-stf-carla", name: "Carla", payType: "daily", rate: 600, position: "Production", pwd: false, userId: null, startDate: ymd(addDays(start, -200)), active: true, allowanceOnly: false, createdAt: at(start, 9) },
    { id: "demo-stf-dong", name: "Dong", payType: "daily", rate: 520, position: "Production helper", pwd: false, userId: null, startDate: ymd(addDays(start, -40)), active: true, allowanceOnly: false, createdAt: at(start, 9) },
  ];
  const timeRecords: TimeRecord[] = [];
  for (let k = 9; k >= 0; k--) {
    const d = addDays(today, -k);
    if (d.getDay() === 0) continue;
    for (const s of staff) {
      const absent = s.id === "demo-stf-dong" && k === 4;
      const half = s.id === "demo-stf-carla" && k === 6;
      timeRecords.push({
        id: `demo-dtr-${s.id}-${ymd(d)}`,
        staffId: s.id,
        date: ymd(d),
        timeIn: absent ? null : rand() < 0.75 ? `07:${pad(r(45, 59))}` : `08:${pad(r(0, 14))}`,
        timeOut: absent || k === 0 ? null : half ? "12:00" : `17:${pad(r(0, 20))}`,
        breakStart: null,
        breakEnd: null,
        status: absent ? "absent" : half ? "half" : "present",
        otHours: 0,
        note: absent ? "Sick" : "",
        loggedById: s.userId ?? ana.id,
        loggedByName: s.userId ? s.name : ana.name,
        createdAt: at(d, 8),
      });
    }
  }

  // ---- Calendar: what's coming up.
  const cal = (days: number, title: string, kind: CalendarItem["kind"], owner: typeof ana, extra: Partial<CalendarItem> = {}): CalendarItem => ({
    id: `demo-cal-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`,
    title,
    kind,
    date: ymd(addDays(today, days)),
    endDate: null,
    startTime: null,
    endTime: null,
    location: "",
    notes: "",
    ownerId: owner.id,
    ownerName: owner.name,
    visibility: "everyone",
    sharedWith: [],
    done: false,
    createdAt: at(addDays(today, Math.min(days, 0) - 3), 9),
    ...extra,
  });
  const calendarItems: CalendarItem[] = [
    cal(0, "Clean and sanitize the grinder", "task", ben, { startTime: "16:00", endTime: "17:00" }),
    cal(1, "Deliver order to Casa Verde Hotel", "task", ana, { startTime: "09:00", endTime: "10:00", location: "Casa Verde Hotel" }),
    cal(2, "Tasting with Brew Lane Café", "event", ana, { startTime: "14:00", endTime: "15:00", notes: "Bring the new vanilla batch." }),
    cal(3, "Collect payment – Sari-Sari Hub", "receivable", ana),
    cal(5, "Pay PackRight Supplies invoice", "payable", ana, { visibility: "private" }),
    cal(7, "Cacao bean delivery from the co-op", "task", ben, { startTime: "08:00", endTime: "09:00" }),
    cal(4, "Dentist appointment", "event", ben, { visibility: "private", startTime: "10:00", endTime: "11:00" }),
    cal(12, "Holiday Bazaar", "event", ana, { endDate: ymd(addDays(today, 14)), location: "City Center Atrium", notes: "Bring extra pints and gift sets." }),
    cal(-2, "Restock tablea pouches", "task", ben, { done: true }),
  ];

  // ---- Production batches.
  const productionRuns: ProductionRun[] = [34, 21, 10, 3].map((days, k) => {
    const d = addDays(today, -days);
    const raw = r(15, 24);
    const usable = Math.round(raw * 0.8 * 10) / 10;
    return {
      id: `demo-run-${k}`,
      name: `Batch ${ymd(d).replace(/-/g, "").slice(2)}`,
      date: ymd(d),
      lotId: `L${ymd(d).replace(/-/g, "").slice(2)}${String.fromCharCode(65 + k)}`,
      materialId: "mat-cacao-beans",
      unit: "kg",
      rawQty: raw,
      usableQty: usable,
      pelletsQty: 0,
      fromBucketQty: 0,
      intoProductsQty: Math.round((usable - 0.5) * 10) / 10,
      leftoverQty: 0.5,
      made: k % 2 ? `${lineName(byId("prod-tableya-150g"))} × ${r(50, 70)}, ${lineName(byId("prod-tableya-312g"))} × ${r(15, 25)}` : `${lineName(byId("prod-tableya-1kg"))} × ${r(4, 8)}, ${lineName(byId("prod-tableya-500g"))} × ${r(8, 12)}`,
      notes: "",
      loggedByName: k % 2 ? ben.name : "Carla",
      createdAt: at(d, 15),
      inputs: null,
      wasteQty: 0,
      excessQty: 0,
      outputs: null,
    };
  });

  // ---- The change log: the latest saves, as the app would have written them.
  const activity: ActivityEvent[] = entries.slice(-24).map((e, k) => ({
    id: `demo-act-${k}`,
    at: e.timestamp,
    userId: e.loggedById ?? ana.id,
    userName: e.loggedByName ?? ana.name,
    action: e.type === "SALE" ? "added a sale" : e.type === "EXPENSE" ? "added an expense" : "added a record",
    collection: "entries",
    op: "append",
    entityId: e.id,
  }));

  const flat = (months: number[]) => JSON.stringify({ months, source: "suggested" });
  const businessSettings = [
    { key: "ownerName", value: ana.name },
    { key: "hourly_labor_rate", value: "90" },
    { key: "cacaoUtilizationPct", value: "80" },
    { key: "salesTargetMonthly", value: "65000" },
    { key: "timekeepers", value: "" },
    ...ITEMS.map((i) => ({
      key: `seasonality:product:${i.id}`,
      value: i.id.includes("ic") ? flat([0.9, 0.9, 1.1, 1.2, 1.15, 0.9, 0.85, 0.85, 0.9, 1, 1.05, 1.25]) : flat([0.8, 0.85, 0.9, 0.95, 0.95, 0.9, 0.9, 0.95, 1, 1.05, 1.2, 1.5]),
    })),
  ];

  const lastBeans = [...entries].reverse().find((e) => e.sku?.startsWith("Cacao beans"));
  const beanKg = Number(lastBeans?.sku?.match(/(\d+) kg/)?.[1] ?? 40);

  return {
    entries,
    products: PRODUCTS,
    recipes: RECIPES,
    rawMaterials: MATERIALS,
    suppliers: SUPPLIERS,
    supplierPriceHistory: [
      { id: "demo-sph-1", supplierId: "demo-sup-coop", date: ymd(addDays(start, 1)), price: 280 },
      { id: "demo-sph-2", supplierId: "demo-sup-coop", date: lastBeans ? lastBeans.timestamp.slice(0, 10) : ymd(today), price: 290 },
      { id: "demo-sph-3", supplierId: "demo-sup-sugar", date: ymd(addDays(start, 2)), price: 75 },
    ],
    budgets: [
      { category: "raw_materials", monthlyBudget: 16000 },
      { category: "packaging", monthlyBudget: 3500 },
      { category: "transport", monthlyBudget: 2000 },
      { category: "Printing & marketing", monthlyBudget: 2500 },
    ],
    events,
    eventStock: [],
    machines: [
      { id: "demo-mch-grinder", name: "Stone grinder", outputs: [{ itemId: "prod-tableya-1kg", kind: "product", qty: 6, per: "hour" }], hoursPerDay: 8, workingDaysPerWeek: 6, notes: "", createdAt: at(start, 9) },
    ],
    supplierPrices: [
      { id: "demo-sp-beans", supplierId: "demo-sup-coop", materialId: "mat-cacao-beans", price: beanKg * 290, quantity: beanKg, unit: "kg", loggedAt: lastBeans?.timestamp ?? at(today, 9) },
      { id: "demo-sp-sugar", supplierId: "demo-sup-sugar", materialId: "mat-sugar", price: 750, quantity: 10, unit: "kg", loggedAt: at(addDays(today, -20), 9) },
    ],
    businessSettings,
    users: [
      { id: ana.id, name: ana.name, role: ana.role, color: ana.color, hasPin: false, createdAt: at(start, 9) },
      { id: ben.id, name: ben.name, role: ben.role, color: ben.color, hasPin: false, createdAt: at(start, 9) },
    ],
    activity,
    staff,
    timeRecords,
    payroll: [],
    calendarItems,
    stockTransfers: [],
    tingi: [],
    productionRuns,
    taskTicks: [],
  };
}
