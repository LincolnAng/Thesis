export function formatPeso(amount: number | null | undefined): string {
  const value = amount ?? 0;
  const text = `₱${Math.abs(value).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  return value < 0 ? `−${text}` : text;
}

/**
 * A price, as opposed to a running total.
 *
 * formatPeso drops a trailing zero, so ₱58.50 renders as "₱58.5" — fine for a sum, wrong for
 * a price, and worse when the same figure appears as "₱58.5" on Products and "₱58.50" on
 * Pricing. Whole pesos stay plain; anything with centavos shows both digits.
 */
export function formatPrice(amount: number | null | undefined): string {
  const rounded = Math.round((amount ?? 0) * 100) / 100;
  if (Number.isInteger(rounded)) return formatPeso(rounded);
  return `${rounded < 0 ? "−" : ""}₱${Math.abs(rounded).toFixed(2)}`;
}

export function formatSignedPeso(amount: number | null | undefined, moneyIn: boolean): string {
  const value = Math.abs(amount ?? 0);
  const sign = moneyIn ? "+" : "−";
  return `${sign}${formatPeso(value)}`;
}

/**
 * "1 jar" / "2 jars" — one place that decides the noun form, so quantity renders can't
 * drift back into "1 jars". Pass an explicit plural for words that don't just take -s.
 */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
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
  events: "Events & booths",
  distribution: "Distribution & delivery",
  misc: "Other",
  // Investment kinds (on R&D/investment entries). See INVESTMENT_CATEGORIES.
  rnd: "R&D",
  equipment: "Equipment & machinery",
  repairs: "Repairs & maintenance",
  tools: "Tools & utensils",
  facility: "Kitchen & facility improvements",
  packaging_design: "Packaging & label design",
  permits: "Permits & certifications",
  training: "Training & seminars",
  branding: "Branding & marketing assets",
  technology: "Software & devices",
  vehicle: "Vehicles & delivery equipment",
  other_investment: "Other investment",
};

/**
 * What an investment was for. Investments are spending that builds the business rather than
 * running it day to day — the owners fund these themselves, so they are tracked on their own
 * tab and kept out of the business's money in, money out and earnings. R&D is one kind among
 * them; older R&D entries with no kind read as "rnd".
 */
export const INVESTMENT_CATEGORIES = [
  "rnd",
  "equipment",
  "repairs",
  "tools",
  "facility",
  "packaging_design",
  "permits",
  "training",
  "branding",
  "technology",
  "vehicle",
  "other_investment",
] as const;

export const ENTRY_TYPE_LABELS: Record<string, string> = {
  SALE: "Sale",
  EXPENSE: "Expense",
  RND: "Investment (owner-funded)",
  CAPITAL: "Capital put in",
  ASSET: "Long-term asset",
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
  RND: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  CAPITAL: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-900",
  ASSET: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
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
  manual: "Self pricing",
  cost_percent: "Cost-based",
  margin: "Margin-based",
};

/**
 * Explains a zero that isn't really zero. A month total of P0 with records sitting just
 * outside the window reads as a bug — it's correct, but only if you can see why.
 */
export function emptyPeriodReason(lastRecordIso: string | null, periodLabel: string): string | null {
  if (!lastRecordIso) return null;
  return `Nothing logged in ${periodLabel} yet — your last was ${formatDate(lastRecordIso)}.`;
}

export function currentMonthLabel(now: Date = new Date()): string {
  return now.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
}

export function previousMonthShortLabel(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return d.toLocaleDateString("en-PH", { month: "long" });
}

/** Banks offered when a payment is a bank transfer. Any other bank can be typed in. */
export const COMMON_BANKS = ["BDO", "BPI", "Metrobank", "Landbank", "PNB", "Security Bank", "UnionBank", "RCBC", "China Bank", "EastWest"] as const;

export const PAYMENT_METHOD_LABELS: Record<string, string> = { cash: "Cash", bank_transfer: "Bank transfer" };

/** "Bank transfer · BDO", "Cash", or "" when not recorded. */
export function describePaymentMethod(method: string | null | undefined, bank: string | null | undefined): string {
  if (!method) return "";
  if (method === "bank_transfer") return `Bank transfer${bank ? ` · ${bank}` : ""}`;
  if (method === "check") return `Check${bank ? ` · ${bank}` : ""}`;
  return "Cash";
}
