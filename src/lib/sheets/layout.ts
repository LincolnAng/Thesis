/**
 * How the spreadsheet is laid out: seven tabs, not nineteen.
 *
 * One tab per kind of record was too many to keep track of in Google Sheets, so related kinds
 * share a tab. Every row of a shared tab says which kind it is in its first column, "section"
 * ("Product", "Recipe line", …), and the tab's columns are every kind's columns together, so
 * each row fills only the ones that are its own.
 *
 * The app finds a column by its name in the list below, never by where it sits — so a kind
 * that gains a column adds it to the END of its tab's list here (and to its own header), and
 * nothing already in the sheet moves.
 *
 * Transactions keeps a tab of its own; it's the one people read most.
 */
export const SHARED_TABS: Record<string, string[]> = {
  "Products & Recipes": [
    "section",
    // Product
    "id", "name", "standardPrice", "pricingMode", "marginPercent", "friendPrice", "wholesalePrice", "stockQty",
    "lowStockThreshold", "batchYield", "deletedAt", "marketPrice", "minutesPerBatch", "laborCostOverride", "unit",
    "sizeLabel", "sizeOfId", "bulkSize", "bulkWord",
    // Recipe line
    "productId", "rowType", "materialId", "label", "quantity", "cost",
  ],
  "Materials & Suppliers": [
    "section",
    // Raw material
    "id", "name", "unit", "qty", "lowStockThreshold", "perBatchQty", "color", "unitCost", "deletedAt", "kind", "reorderPoint",
    // Supplier
    "type", "items", "lastPrice", "contact",
    // Price history
    "supplierId", "date", "price",
    // Supplier price
    "materialId", "quantity", "loggedAt",
  ],
  "Events & Stock": [
    "section",
    // Event
    "id", "name", "kind", "startDate", "endDate", "status", "notes", "createdAt", "deletedAt",
    // Event stock
    "eventId", "productId", "type", "quantity",
    // Production run
    "date", "lotId", "materialId", "unit", "rawQty", "usableQty", "fromBucketQty", "intoProductsQty", "leftoverQty", "made",
    "loggedByName",
    // Cacao bucket — no longer used (leftovers go into tingi); kept so the columns after it stay put
    "direction", "runId", "purpose",
    // Production run, later
    "pelletsQty",
  ],
  "People & Payroll": [
    "section",
    // User
    "id", "name", "pinHash", "role", "createdAt", "deletedAt", "pin", "color", "pinSecure",
    // Staff
    "payType", "rate", "position", "pwd", "userId", "startDate", "active", "allowanceOnly",
    // Time record
    "staffId", "date", "timeIn", "timeOut", "status", "otHours", "note", "loggedById", "loggedByName",
    // Payroll
    "kind", "periodStart", "periodEnd", "basic", "overtime", "deductions", "deductionNote", "net", "paidOn", "entryId",
    "sss", "philhealth", "pagibig",
    // Added later: a time record's break, and a payslip's additions
    "breakStart", "breakEnd", "additions", "additionNote",
  ],
  "Shop Setup": [
    "section",
    // Setting, AI setting
    "key", "value", "deletedAt",
    // Budget
    "category", "monthlyBudget",
    // Machine
    "id", "name", "batchesPerDay", "workingDaysPerWeek", "notes", "createdAt", "outputs", "hoursPerDay",
  ],
  Logs: [
    "section",
    // Activity
    "id", "at", "userId", "userName", "action", "deletedAt", "collection", "op", "entityId", "before", "undoneAt",
    // Chat
    "role", "kind", "createdAt", "payload",
  ],
};
