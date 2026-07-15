#!/usr/bin/env node
// One-time (but safe to re-run) setup pass over the real Mang Kiko's Cocoa spreadsheet:
// renames Entries -> Transactions, adds read-only Sales/Expenses/Stock Movements
// QUERY-formula views + a Summary tab, formats every business tab (header, frozen
// row, currency/number formats, zebra striping, tab colors), and reorders/regroups
// every tab so Summary comes first and the internal ChatHistory/Settings tabs sit
// at the end. Deliberately self-contained (no TS build step) — same minimal
// service-account REST auth pattern used elsewhere in this project's ad-hoc scripts.
//
// Run with: node scripts/setup-sheets.mjs   (reads .env.local from the project root)

import { readFileSync } from "fs";
import crypto from "crypto";

function loadEnvLocal() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const env = {};
  let key = null;
  for (const rawLine of text.split("\n")) {
    const m = rawLine.match(/^([A-Z_]+)=(.*)$/);
    if (m) {
      key = m[1];
      env[key] = m[2];
    } else if (key && rawLine.trim()) {
      env[key] += "\n" + rawLine; // continuation of a multi-line quoted value
    }
  }
  for (const k of Object.keys(env)) {
    env[k] = env[k].replace(/^"|"$/g, "");
  }
  return env;
}

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(env) {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n");
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const signingInput = `${base64url(Buffer.from(JSON.stringify(header)))}.${base64url(Buffer.from(JSON.stringify(claims)))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const jwt = `${signingInput}.${base64url(signer.sign(privateKey))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("No access token: " + JSON.stringify(json));
  return json.access_token;
}

const env = loadEnvLocal();
const token = await getAccessToken(env);
const spreadsheetId = env.GOOGLE_SHEETS_SPREADSHEET_ID;
const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;

async function api(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function batchUpdate(requests) {
  if (requests.length === 0) return;
  await api(":batchUpdate", { method: "POST", body: JSON.stringify({ requests }) });
}

async function setValues(range, values) {
  await api(`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ range, majorDimension: "ROWS", values }),
  });
}

// --- 1. Discover current tabs, rename Entries -> Transactions, create new tabs ---

const meta = await api("?fields=sheets.properties");
const byTitle = new Map(meta.sheets.map((s) => [s.properties.title, s.properties]));
console.log("Existing tabs:", [...byTitle.keys()].join(", "));

const setupRequests = [];

if (byTitle.has("Entries") && !byTitle.has("Transactions")) {
  setupRequests.push({
    updateSheetProperties: { properties: { sheetId: byTitle.get("Entries").sheetId, title: "Transactions" }, fields: "title" },
  });
  byTitle.set("Transactions", { ...byTitle.get("Entries"), title: "Transactions" });
  byTitle.delete("Entries");
  console.log("Renaming Entries -> Transactions");
}

const NEW_TABS = ["Summary", "Sales", "Expenses", "Stock Movements"];
for (const title of NEW_TABS) {
  if (!byTitle.has(title)) {
    setupRequests.push({ addSheet: { properties: { title } } });
  }
}

if (setupRequests.length > 0) {
  await batchUpdate(setupRequests);
  console.log("Created new tabs:", NEW_TABS.filter((t) => !meta.sheets.some((s) => s.properties.title === t)).join(", "));
}

// Re-fetch sheet IDs now that renames/creations have landed.
const meta2 = await api("?fields=sheets.properties,sheets.bandedRanges");
const sheetIdsWithBanding = new Set(
  meta2.sheets.filter((s) => (s.bandedRanges ?? []).length > 0).map((s) => s.properties.sheetId),
);
const idOf = (title) => {
  const found = meta2.sheets.find((s) => s.properties.title === title);
  if (!found) throw new Error(`sheet not found after creation: ${title}`);
  return found.properties.sheetId;
};

// --- 2. Write the QUERY-formula view tabs + Summary formulas ------------------
// Transactions column letters: A id, B timestamp, C type, D amount, E quantity,
// F unit, G sku, H counterparty, I location, J priceType, K category, L rawText,
// M confidence, N notes, O deletedAt.

await setValues("Sales!A1", [
  [
    '=QUERY(Transactions!A:O, "select B, G, H, E, D, J where C = \'SALE\' and O is null order by B desc label B \'Date\', G \'Item\', H \'Buyer\', E \'Qty\', D \'Amount\', J \'Price Type\'", 1)',
  ],
]);

await setValues("Expenses!A1", [
  [
    '=QUERY(Transactions!A:O, "select B, G, K, D where C = \'EXPENSE\' and O is null order by B desc label B \'Date\', G \'Item\', K \'Category\', D \'Amount\'", 1)',
  ],
]);

await setValues("Stock Movements!A1", [
  [
    '=QUERY(Transactions!A:O, "select B, C, G, E, F where (C = \'INVENTORY_IN\' or C = \'INVENTORY_OUT\' or C = \'WASTE\') and O is null order by B desc label B \'Date\', C \'Type\', G \'Item\', E \'Qty\', F \'Unit\'", 1)',
  ],
]);

await setValues("Summary!A1", [
  ["Mang Kiko's Cocoa — Business Summary", ""],
  ["", ""],
  ["Total Revenue (all-time)", '=SUMIFS(Transactions!D:D,Transactions!C:C,"SALE",Transactions!O:O,"")'],
  ["Total Expenses (all-time)", '=SUMIFS(Transactions!D:D,Transactions!C:C,"EXPENSE",Transactions!O:O,"")'],
  ["Net Cash Flow (all-time)", "=B3-B4"],
  ["Sales Logged", '=COUNTIFS(Transactions!C:C,"SALE",Transactions!O:O,"")'],
  ["", ""],
  ["Products Tracked", "=COUNTA(Products!A2:A)"],
  ["Products Low on Stock", "=SUMPRODUCT((Products!H2:H500<>\"\")*(Products!H2:H500<=Products!I2:I500))"],
  ["Ingredients Tracked", "=COUNTA('Raw Materials'!A2:A)"],
  ["Ingredients Low on Stock", "=SUMPRODUCT(('Raw Materials'!D2:D500<>\"\")*('Raw Materials'!D2:D500<='Raw Materials'!E2:E500))"],
  ["Suppliers", "=COUNTA(Suppliers!A2:A)"],
  ["", ""],
  ["Last updated", "=NOW()"],
]);

console.log("Wrote formulas to Sales, Expenses, Stock Movements, Summary");

// --- 3. Formatting + tab colors + reorder, all in one combined batchUpdate ----

const GREEN = { red: 0.16, green: 0.42, blue: 0.27 };
const RED = { red: 0.62, green: 0.2, blue: 0.16 };
const AMBER = { red: 0.62, green: 0.42, blue: 0.1 };
const BLUE = { red: 0.18, green: 0.32, blue: 0.55 };
const PURPLE = { red: 0.4, green: 0.25, blue: 0.5 };
const GREY = { red: 0.5, green: 0.5, blue: 0.5 };
const GOLD = { red: 0.55, green: 0.42, blue: 0.1 };
const WHITE = { red: 1, green: 1, blue: 1 };
const PESO = '"₱"#,##0.00';
const PESO_INT = '"₱"#,##0';
const PERCENT = "0.0%";

function headerAndFreeze(sheetId, columnCount, tabColor) {
  return [
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: columnCount },
        cell: {
          userEnteredFormat: {
            backgroundColor: tabColor,
            textFormat: { bold: true, foregroundColor: WHITE },
            verticalAlignment: "MIDDLE",
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat,verticalAlignment)",
      },
    },
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 }, tabColor },
        fields: "gridProperties.frozenRowCount,tabColor",
      },
    },
  ];
}

function numberFormat(sheetId, columnIndex, pattern, startRow = 1, endRow) {
  const range = { sheetId, startRowIndex: startRow, startColumnIndex: columnIndex, endColumnIndex: columnIndex + 1 };
  if (endRow !== undefined) range.endRowIndex = endRow;
  return {
    repeatCell: {
      range,
      cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern } } },
      fields: "userEnteredFormat.numberFormat",
    },
  };
}

/** Returns null (skip) if this sheet already has banding — re-adding fails outright,
 * and this script is meant to be safe to re-run. */
function zebra(sheetId, columnCount) {
  if (sheetIdsWithBanding.has(sheetId)) return null;
  return {
    addBanding: {
      bandedRange: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: columnCount },
        rowProperties: { firstBandColor: WHITE, secondBandColor: { red: 0.97, green: 0.96, blue: 0.94 } },
      },
    },
  };
}

function filter(sheetId, columnCount) {
  return { setBasicFilter: { filter: { range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: columnCount } } } };
}

const requests = [];

// Transactions (id,timestamp,type,amount,quantity,unit,sku,counterparty,location,priceType,category,rawText,confidence,notes,deletedAt)
{
  const sheetId = idOf("Transactions");
  requests.push(...headerAndFreeze(sheetId, 15, GREEN));
  requests.push(numberFormat(sheetId, 3, PESO));
  requests.push(zebra(sheetId, 15));
  requests.push(filter(sheetId, 15));
}

// Sales / Expenses / Stock Movements — formula-driven views, header styled to match, no filter (formula output).
{
  const sheetId = idOf("Sales");
  requests.push(...headerAndFreeze(sheetId, 6, GREEN));
  requests.push(numberFormat(sheetId, 4, PESO));
}
{
  const sheetId = idOf("Expenses");
  requests.push(...headerAndFreeze(sheetId, 4, RED));
  requests.push(numberFormat(sheetId, 3, PESO));
}
{
  const sheetId = idOf("Stock Movements");
  requests.push(...headerAndFreeze(sheetId, 5, AMBER));
}

// Products (id,name,standardPrice,pricingMode,marginPercent,friendPrice,wholesalePrice,stockQty,lowStockThreshold,batchYield,deletedAt)
{
  const sheetId = idOf("Products");
  requests.push(...headerAndFreeze(sheetId, 11, BLUE));
  requests.push(numberFormat(sheetId, 2, PESO));
  requests.push(numberFormat(sheetId, 4, PERCENT));
  requests.push(numberFormat(sheetId, 5, PESO));
  requests.push(numberFormat(sheetId, 6, PESO));
  requests.push(zebra(sheetId, 11));
  requests.push(filter(sheetId, 11));
}

// Recipes (id,productId,rowType,materialId,label,quantity,cost,deletedAt)
{
  const sheetId = idOf("Recipes");
  requests.push(...headerAndFreeze(sheetId, 8, BLUE));
  requests.push(numberFormat(sheetId, 6, PESO));
  requests.push(zebra(sheetId, 8));
}

// Raw Materials (id,name,unit,qty,lowStockThreshold,perBatchQty,color,unitCost,deletedAt)
{
  const sheetId = idOf("Raw Materials");
  requests.push(...headerAndFreeze(sheetId, 9, BLUE));
  requests.push(numberFormat(sheetId, 7, PESO));
  requests.push(zebra(sheetId, 9));
  requests.push(filter(sheetId, 9));
}

// Suppliers (id,name,type,items,lastPrice,contact,deletedAt)
{
  const sheetId = idOf("Suppliers");
  requests.push(...headerAndFreeze(sheetId, 7, PURPLE));
  requests.push(numberFormat(sheetId, 4, PESO));
  requests.push(zebra(sheetId, 7));
}

// Supplier Price History (id,supplierId,date,price,deletedAt)
{
  const sheetId = idOf("Supplier Price History");
  requests.push(...headerAndFreeze(sheetId, 5, PURPLE));
  requests.push(numberFormat(sheetId, 3, PESO));
}

// Marketing (id,platform,weekOf,followers,reach,engagements,deletedAt)
{
  const sheetId = idOf("Marketing");
  requests.push(...headerAndFreeze(sheetId, 7, PURPLE));
  requests.push(zebra(sheetId, 7));
}

// Budgets (category,monthlyBudget,deletedAt)
{
  const sheetId = idOf("Budgets");
  requests.push(...headerAndFreeze(sheetId, 3, BLUE));
  requests.push(numberFormat(sheetId, 1, PESO_INT));
}

// Summary — title row + bold labels + currency on money rows, not a generic table.
{
  const sheetId = idOf("Summary");
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 },
      cell: { userEnteredFormat: { backgroundColor: GOLD, textFormat: { bold: true, fontSize: 14, foregroundColor: WHITE } } },
      fields: "userEnteredFormat(backgroundColor,textFormat)",
    },
  });
  requests.push({
    mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 2 }, mergeType: "MERGE_ALL" },
  });
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 14, startColumnIndex: 0, endColumnIndex: 1 },
      cell: { userEnteredFormat: { textFormat: { bold: true } } },
      fields: "userEnteredFormat.textFormat",
    },
  });
  requests.push(numberFormat(sheetId, 1, "0", 5, 14)); // reset rows 6-14 first — an earlier bad run left them formatted as currency
  requests.push(numberFormat(sheetId, 1, PESO, 2, 5)); // rows 3-5 only (Revenue/Expenses/Net)
  requests.push(numberFormat(sheetId, 1, "yyyy-mm-dd hh:mm", 13, 14)); // row 14 (Last updated)
  requests.push({
    updateSheetProperties: { properties: { sheetId, tabColor: GOLD }, fields: "tabColor" },
  });
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
      properties: { pixelSize: 220 },
      fields: "pixelSize",
    },
  });
}

// ChatHistory / Settings — plain grey, app plumbing not business data.
for (const title of ["ChatHistory", "Settings"]) {
  if (byTitle.has(title) || meta2.sheets.some((s) => s.properties.title === title)) {
    const sheetId = idOf(title);
    requests.push({ updateSheetProperties: { properties: { sheetId, tabColor: GREY }, fields: "tabColor" } });
  }
}

// Reorder every tab into one logical sequence.
const ORDER = [
  "Summary",
  "Transactions",
  "Sales",
  "Expenses",
  "Stock Movements",
  "Products",
  "Recipes",
  "Raw Materials",
  "Suppliers",
  "Supplier Price History",
  "Marketing",
  "Budgets",
  "ChatHistory",
  "Settings",
];
ORDER.forEach((title, index) => {
  if (meta2.sheets.some((s) => s.properties.title === title)) {
    requests.push({ updateSheetProperties: { properties: { sheetId: idOf(title), index }, fields: "index" } });
  }
});

const finalRequests = requests.filter(Boolean);
await batchUpdate(finalRequests);
console.log(`Applied formatting + reordering across ${finalRequests.length} requests.`);
console.log("Done. Open the spreadsheet to eyeball the result.");
