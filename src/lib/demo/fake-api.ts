import { decideWrite, needsExistingRow, redactForEmployee, visibleCalendarItems, type BusinessData, type CollectionName } from "@/lib/auth/permissions";
import { assembleProduct, type ProductRow } from "@/lib/store/sheet-shapes";
import { effectiveProductPrice, productCostPerJar, type CostContext } from "@/lib/summary/recipe-cost";
import { summarizeAiUse } from "@/lib/ai/usage-summary";
import type { StaffMember } from "@/lib/store/types";
import { buildDemoData } from "./demo-data";
import { DEMO_KEYS, DEMO_PROFILES, IS_DEMO, type DemoProfile } from "./mode";

/**
 * The demo site's server, running in the visitor's browser.
 *
 * In demo mode every request the app makes to /api/... is answered here instead of going over
 * the network, from a copy of the made-up business kept in this browser's storage. The app's
 * own code — the store, its saves, its sync poll, the role rules — runs unchanged against it, so
 * the demo behaves exactly like the real thing. The role rules are the real ones too: the
 * Employee view gets the same redacted copy the server would send, and the same writes are
 * refused.
 *
 * The demo deployment has no Google or AI keys at all, so even a request that slipped past this
 * would find nothing to read.
 */

interface Db {
  /** Rebuilt when the month changes, so the dates never drift into the past. */
  builtFor: string;
  data: BusinessData;
}

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

let memory: Db | null = null;

function load(): Db {
  if (memory && memory.builtFor === monthKey()) return memory;
  try {
    const raw = window.localStorage.getItem(DEMO_KEYS.db);
    const parsed = raw ? (JSON.parse(raw) as Db) : null;
    if (parsed && parsed.builtFor === monthKey() && parsed.data?.entries) {
      memory = parsed;
      return memory;
    }
  } catch {
    // unreadable — start over
  }
  memory = { builtFor: monthKey(), data: buildDemoData() };
  save();
  return memory;
}

function save() {
  try {
    if (memory) window.localStorage.setItem(DEMO_KEYS.db, JSON.stringify(memory));
  } catch {
    // Storage full or blocked: the demo keeps working for this visit.
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

/** Who the visitor is viewing as — kept alongside the app's own signed-in copy. */
export function demoProfile(): DemoProfile {
  try {
    const raw = window.localStorage.getItem("mang-kikos-cocoa-current-user-v2");
    const user = raw ? (JSON.parse(raw) as { id?: string }) : null;
    if (user?.id === DEMO_PROFILES.employee.id) return DEMO_PROFILES.employee;
  } catch {
    // fall through
  }
  return DEMO_PROFILES.executive;
}

/** Same as costContextOf in lib/auth/load-business-data, which can't be bundled for the browser. */
function costContext(data: BusinessData): CostContext {
  const settings = Object.fromEntries(data.businessSettings.map((s) => [s.key, s.value]));
  return {
    rawMaterials: data.rawMaterials,
    supplierPrices: data.supplierPrices as CostContext["supplierPrices"],
    hourlyLaborRate: Number(settings["hourly_labor_rate"]) || 0,
    cacaoUtilization: Math.min(100, Math.max(1, Number(settings["cacaoUtilizationPct"]) || 100)) / 100,
    entries: data.entries,
    products: data.products.map((row) => assembleProduct(row, data.recipes)),
  };
}

/** What /api/business-data would send this profile (see loadBusinessDataFor). */
function viewFor(me: DemoProfile): BusinessData {
  const all = load().data;
  const fortnightAgo = new Date(Date.now() - 14 * 864e5).toLocaleDateString("en-CA");
  const data: BusinessData = {
    ...all,
    calendarItems: visibleCalendarItems(all.calendarItems, me.id),
    taskTicks: all.taskTicks.filter((t) => t.day >= fortnightAgo),
  };
  if (me.role === "executive") return data;
  const ctx = costContext(data);
  const sellingPrice = (row: ProductRow) => {
    const product = ctx.products.find((p) => p.id === row.id);
    return product ? effectiveProductPrice(product, productCostPerJar(product, ctx)) : row.standardPrice;
  };
  return redactForEmployee(data, sellingPrice, me.id, me.role);
}

/** Rows are keyed by id, except the two tabs keyed by name. */
const keyOf = (collection: string) => (collection === "budgets" ? "category" : collection === "businessSettings" ? "key" : "id");

function mutate(body: { collection?: string; op?: string; id?: string; item?: unknown; items?: unknown[] }): { status: number; json: unknown } {
  const db = load();
  const name = body.collection as CollectionName;
  const rows = (db.data as unknown as Record<string, Record<string, unknown>[]>)[name ?? ""];
  if (!Array.isArray(rows)) return { status: 400, json: { success: false, reason: "unknown_collection" } };
  const op = body.op;
  if (op !== "append" && op !== "update" && op !== "delete" && op !== "migrate") return { status: 400, json: { success: false, reason: "unknown_op" } };

  const me = demoProfile();
  const key = keyOf(name);
  const existing = body.id && needsExistingRow(me.role, name, op) ? rows.find((row) => row[key] === body.id) : undefined;
  const decision = decideWrite({
    ownStaffIds: me.role === "admin" && name === "timeRecords" ? (db.data.staff as StaffMember[]).filter((s) => s.active).map((s) => s.id) : undefined,
    role: me.role,
    user: { id: me.id, name: me.name },
    collection: name,
    op,
    item: body.item as Record<string, unknown> | undefined,
    existing,
  });
  if (!decision.allow) return { status: 403, json: { success: false, reason: decision.reason } };
  const item = (decision.item ?? body.item) as Record<string, unknown> | undefined;

  if (op === "append" && item) rows.push(item);
  else if (op === "migrate" && Array.isArray(body.items)) rows.push(...(body.items as Record<string, unknown>[]));
  else if (op === "update" && body.id && item) {
    const at = rows.findIndex((row) => row[key] === body.id);
    if (at >= 0) rows[at] = item;
    else rows.push(item);
  } else if (op === "delete" && body.id) {
    const at = rows.findIndex((row) => row[key] === body.id);
    if (at >= 0) rows.splice(at, 1);
  } else return { status: 400, json: { success: false, reason: "missing_fields" } };
  save();
  return { status: 200, json: { success: true } };
}

/** What every AI feature says in the demo: the site has no AI key, on purpose. */
const AI_OFF_REPLY =
  "This is the demo site, so BAi (the AI assistant) is switched off here — there's no AI key, and nothing you type leaves this browser.\n\n" +
  "In the live system, BAi answers questions about the shop's own records (\"How much did we sell last month?\", \"Which product earns the most?\") and can log a sale or expense from a plain sentence like \"Sold 3 tablea to Liza for ₱1,050 cash\".\n\n" +
  "Everything else in the demo works: add sales and expenses from Transactions, check stock in Inventory, look at the forecast, or switch between the Executive and Employee views at the top.";

type Handler = (method: string, body: unknown, url: URL) => { status?: number; json: unknown };

const ROUTES: Record<string, Handler> = {
  "/api/business-data": (method, body) => {
    if (method === "GET") {
      const me = demoProfile();
      return { json: { success: true, role: me.role, ...viewFor(me) } };
    }
    const result = mutate((body ?? {}) as Parameters<typeof mutate>[0]);
    return { status: result.status, json: result.json };
  },
  "/api/auth/session": (method) => {
    const me = demoProfile();
    const user = { id: me.id, name: me.name, role: me.role, color: me.color, hasPin: false, createdAt: new Date().toISOString() };
    return { json: method === "DELETE" ? { success: true } : { success: true, user } };
  },
  "/api/auth/profiles": (method) =>
    method === "GET"
      ? { json: { success: true, profiles: load().data.users } }
      : { status: 403, json: { success: false, reason: "forbidden" } },
  "/api/settings": (method) =>
    method === "GET"
      ? { json: { success: true, hasKey: false, keyPreview: null, model: "", botLanguage: "English", monthlyLimitPhp: 0, spentThisMonthPhp: 0, spreadsheetUrl: null } }
      : { json: { success: true } },
  "/api/ai-usage": (_m, _b, url) => {
    const asked = url.searchParams.get("month") ?? "";
    const month = /^\d{4}-\d{2}$/.test(asked) ? asked : monthKey();
    return { json: { success: true, phpPerUsd: 58, currentMonth: monthKey(), summary: summarizeAiUse([], month, 0), months: [] } };
  },
  "/api/chat-history": (method, body) => {
    const me = demoProfile();
    type Msg = { id: string; sessionId?: string; ownerId?: string };
    const all = readJson<Msg[]>(DEMO_KEYS.chat, []);
    const b = (body ?? {}) as { id?: string; sessionId?: string; message?: Msg };
    if (method === "GET") return { json: { success: true, messages: all.filter((m) => m.ownerId === me.id) } };
    if (method === "POST" && b.message) writeJson(DEMO_KEYS.chat, [...all, { ...b.message, ownerId: me.id }]);
    if (method === "PATCH" && b.id && b.message) writeJson(DEMO_KEYS.chat, all.map((m) => (m.id === b.id ? { ...b.message!, ownerId: me.id } : m)));
    if (method === "DELETE") writeJson(DEMO_KEYS.chat, all.filter((m) => (b.sessionId ? m.sessionId !== b.sessionId : m.id !== b.id)));
    return { json: { success: true } };
  },
  "/api/photos": (method, body) => {
    const photos = readJson<Record<string, string>>(DEMO_KEYS.photos, {});
    if (method === "GET") return { json: { success: true, photos } };
    const b = (body ?? {}) as { id?: string; dataUrl?: string | null };
    if (!b.id) return { status: 400, json: { success: false, reason: "missing_id" } };
    if (b.dataUrl) photos[b.id] = b.dataUrl;
    else delete photos[b.id];
    writeJson(DEMO_KEYS.photos, photos);
    return { json: { success: true } };
  },
  // The chat: a real-looking reply that explains the AI is off here.
  "/api/agent": () => ({ json: { success: true, reply: AI_OFF_REPLY, sources: [], usedWeb: false, proposal: null } }),
  // The other AI helpers fall back to what the app does without a key.
  "/api/assistant": () => ({ json: { success: false, reason: "missing_api_key" } }),
  "/api/advisor": () => ({ json: { success: false, reason: "missing_api_key" } }),
  "/api/sharpen": () => ({ json: { success: false, reason: "missing_api_key" } }),
  "/api/triage": () => ({ json: { success: false, reason: "missing_api_key" } }),
  "/api/season-pattern": () => ({ json: { success: false, reason: "missing_api_key" } }),
};

/** Paths that are safe to send to the demo's own server: public data, no keys involved. */
const PASS_THROUGH = ["/api/holidays"];

let installed = false;

/** Routes the app's /api requests to the in-browser demo server. Runs once, before anything loads. */
export function installDemoApi() {
  if (installed || !IS_DEMO || typeof window === "undefined") return;
  installed = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/") || PASS_THROUGH.includes(url.pathname)) {
      return realFetch(input, init);
    }
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    let body: unknown = null;
    try {
      const raw = init?.body ?? (input instanceof Request && method !== "GET" ? await input.clone().text() : null);
      body = typeof raw === "string" && raw ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }
    const handler = ROUTES[url.pathname];
    const result = handler ? handler(method, body, url) : { status: 404, json: { success: false, reason: "not_in_demo" } };
    // A moment's wait, so loading states show the way they do against the real server.
    await new Promise((resolve) => setTimeout(resolve, 60));
    return new Response(JSON.stringify(result.json), { status: result.status ?? 200, headers: { "Content-Type": "application/json" } });
  };
}

/** Starts the demo over: the made-up shop as it was, no chat, no photos. */
export function resetDemo() {
  try {
    for (const key of [DEMO_KEYS.db, DEMO_KEYS.chat, DEMO_KEYS.photos, "mang-kikos-cocoa-state-v6", "mang-kikos-cocoa-chat-paint-cache-v1"]) window.localStorage.removeItem(key);
  } catch {
    // nothing to clear
  }
  memory = null;
}
