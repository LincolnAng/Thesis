import { formatPeso } from "@/lib/format";
import { obligationKind, outstanding, paidSoFar } from "@/lib/transactions/ledger";
import type { Entry } from "@/lib/store/types";

/** "Cash", "Bank transfer · BDO", or null when nothing was said. */
export function methodPhrase(method: string | null | undefined, bank: string | null | undefined): string | null {
  if (method === "cash") return "Cash";
  if (method === "bank_transfer") return bank ? `Bank transfer · ${bank}` : "Bank transfer";
  return null;
}

function dueOn(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
}

/**
 * What a saved record means, in plain words and in the same terms the Transactions page uses:
 * what was recorded, the amount, how it was paid, and — for something still owed — what is
 * left and when it is due. The chat repeats this back after a save so the owner can see it
 * went in the way they meant it.
 */
export function describeSaved(e: Entry): string {
  const who = e.counterparty ? ` ${e.type === "SALE" ? "from" : "to"} ${e.counterparty}` : "";
  const amount = formatPeso(e.amount ?? 0);
  const kind = obligationKind(e);

  if (e.type === "SALE" || e.type === "EXPENSE") {
    if (!kind) {
      const how = methodPhrase(e.paymentMethod, e.bankName);
      return e.type === "SALE"
        ? `Money received: ${amount}${who}${how ? ` · ${how}` : ""}`
        : `Money paid: ${amount}${who}${how ? ` · ${how}` : ""}`;
    }
    const paid = paidSoFar(e);
    const left = outstanding(e);
    const owner = e.counterparty ?? (kind === "receivable" ? "A customer" : "A supplier");
    const head =
      kind === "receivable"
        ? `Still owed to you: ${amount} by ${owner}`
        : `You still owe: ${amount} to ${e.counterparty ?? "a supplier"}`;
    const parts = [head];
    if (paid > 0) parts.push(`${formatPeso(paid)} ${kind === "receivable" ? "received" : "paid"} so far`);
    parts.push(`${formatPeso(left)} left`);
    if (e.dueDate) parts.push(`due ${dueOn(e.dueDate)}`);
    return parts.join(" · ");
  }
  if (e.type === "RND") return `Investment of ${amount} recorded — paid by the owners, so it isn't counted in money paid.`;
  if (e.type === "WASTE") return `Spoilage recorded${e.sku ? `: ${e.sku}` : ""}.`;
  return "Recorded.";
}
