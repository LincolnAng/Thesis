export function formatPeso(amount: number | null | undefined): string {
  const value = amount ?? 0;
  return `₱${value.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatSignedPeso(amount: number | null | undefined, moneyIn: boolean): string {
  const value = Math.abs(amount ?? 0);
  const sign = moneyIn ? "+" : "−";
  return `${sign}${formatPeso(value)}`;
}

export function formatNumber(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString("en-PH");
}

/** Abbreviated peso amount for tight spaces like chart axes, e.g. "₱12.5k". */
export function formatPesoAbbrev(amount: number | null | undefined): string {
  const value = amount ?? 0;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1000) return `₱${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `₱${Math.round(value)}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  raw_materials: "Ingredients",
  labor: "Labor",
  utilities: "Utilities",
  packaging: "Packaging",
  transport: "Transport",
  misc: "Other",
};

export const ENTRY_TYPE_LABELS: Record<string, string> = {
  SALE: "Sale",
  EXPENSE: "Expense",
  INVENTORY_IN: "Batch made",
  INVENTORY_OUT: "Stock out",
  WASTE: "Waste",
  SUPPLIER: "Supplier",
  NOTE: "Note",
};

// Only two strong colors in this app: green for money in, amber for warnings/expenses.
// Everything else stays neutral so those two keep their meaning.
export const ENTRY_TYPE_COLORS: Record<string, string> = {
  SALE: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-900",
  EXPENSE: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  INVENTORY_IN: "bg-muted text-muted-foreground border-border",
  INVENTORY_OUT: "bg-muted text-muted-foreground border-border",
  WASTE: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  SUPPLIER: "bg-muted text-muted-foreground border-border",
  NOTE: "bg-muted text-muted-foreground border-border",
};

export const PRICE_TYPE_LABELS: Record<string, string> = {
  standard: "Regular",
  friend: "Friend",
  wholesale: "Wholesale",
};

export const PRICING_MODE_LABELS: Record<string, string> = {
  manual: "Custom",
  cost_percent: "Cost-based",
  competitive: "Market-based",
  suggested: "Suggested",
};

export function currentMonthLabel(now: Date = new Date()): string {
  return now.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
}

export function previousMonthShortLabel(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return d.toLocaleDateString("en-PH", { month: "long" });
}
