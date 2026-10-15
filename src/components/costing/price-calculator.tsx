"use client";

import { useState } from "react";
import { Hand, Percent, PiggyBank, type LucideIcon } from "lucide-react";
import { updateProduct } from "@/lib/store/store";
import { evaluate, priceFor, type CalcMode } from "@/lib/costing/price-calc";
import { MAX_MARGIN_PCT } from "@/lib/summary/pricing-methods";
import { formatPeso } from "@/lib/format";
import type { PricingMode, Product } from "@/lib/store/types";

/**
 * The Price tab. The three ways to set a price sit side by side as choices, each saying in one
 * line what it does, so none of them is hidden behind a "more options" link:
 *
 *   Type a price      — you choose the number; it stays put when costs change
 *   Add a markup      — the cost plus a share of the cost; moves with the cost
 *   Aim for a margin  — keep a share of every sale; moves with the cost
 *
 * Under the choice, one box to fill in, the result in plain words (sells for, you keep), and
 * Save. Nothing changes the product's price until Save is pressed. Past sales keep the price
 * they were sold at either way — a transaction stores its own amount. The friend price sits
 * at the bottom.
 */

const MODE_FOR_SAVE: Record<CalcMode, PricingMode> = { price: "manual", markup: "cost_percent", margin: "margin" };

const WAYS: { mode: CalcMode; icon: LucideIcon; title: string; says: string; moves: string }[] = [
  { mode: "price", icon: Hand, title: "Type a price", says: "You choose the number.", moves: "Stays the same when your costs change." },
  { mode: "markup", icon: Percent, title: "Add a markup", says: "Your cost, plus a percent of it on top.", moves: "Goes up and down with your costs." },
  { mode: "margin", icon: PiggyBank, title: "Aim for a margin", says: "Keep a set percent of every sale.", moves: "Goes up and down with your costs." },
];

function startingMode(p: Product): CalcMode {
  return p.pricingMode === "cost_percent" ? "markup" : p.pricingMode === "margin" ? "margin" : "price";
}

export function PriceCalculator({
  product,
  unitCost,
  currentPrice,
  unit,
}: {
  product: Product;
  /** Cost per unit, or null when it can't be worked out yet. */
  unitCost: number | null;
  /** The price the product sells for now. */
  currentPrice: number;
  unit: string;
}) {
  const [mode, setMode] = useState<CalcMode>(startingMode(product));
  const [value, setValue] = useState(() => String(startingMode(product) === "price" ? currentPrice || "" : product.marginPercent || ""));
  const [friend, setFriend] = useState(product.friendPrice ? String(product.friendPrice) : "");
  const [saved, setSaved] = useState<string | null>(null);

  const typed = Number(value);
  const price = value === "" ? null : priceFor(mode, typed, unitCost);
  const r = evaluate(price, unitCost);
  const changed =
    price != null &&
    (Math.abs(price - currentPrice) >= 0.01 || MODE_FOR_SAVE[mode] !== product.pricingMode || (mode !== "price" && typed !== product.marginPercent));
  const friendChanged = Number(friend || 0) !== product.friendPrice;
  const friendResult = evaluate(friend === "" ? null : Number(friend), unitCost);

  function choose(next: CalcMode) {
    if (next === mode) return;
    // Carry the price on screen into the new way of describing it, so switching never jumps.
    const carry = next === "price" ? price : next === "markup" ? r.markupPct : r.marginPct;
    setMode(next);
    setValue(carry != null ? String(carry) : "");
    setSaved(null);
  }

  function save() {
    if (price == null) return;
    const patch: Partial<Product> =
      mode === "price"
        ? { pricingMode: "manual", standardPrice: price }
        : { pricingMode: MODE_FOR_SAVE[mode], marginPercent: mode === "margin" ? Math.min(typed, MAX_MARGIN_PCT) : typed, standardPrice: price };
    updateProduct(product.id, patch);
    setSaved(`Saved — it now sells for ${formatPeso(price)} a ${unit}.`);
  }

  const field = "h-12 rounded-lg border border-input bg-transparent px-3 text-[20px] font-bold tabular-nums outline-none focus:border-cacao";
  const costText = unitCost != null ? formatPeso(unitCost) : null;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[14px]">
        {currentPrice > 0 ? (
          <>
            Sells for <span className="font-semibold">{formatPeso(currentPrice)}</span> a {unit} now
            <span className="text-muted-foreground">
              {product.pricingMode === "manual"
                ? " · a price you typed"
                : ` · ${product.marginPercent}% ${product.pricingMode === "margin" ? "margin" : "markup"}, so it follows your costs`}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">No price yet.</span>
        )}
        {costText && <span className="text-muted-foreground"> · costs {costText} to make</span>}
      </p>

      {/* The three ways, side by side */}
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold">How do you want to set the price?</span>
        <div className="grid grid-cols-1 gap-2 min-[640px]:grid-cols-3" role="radiogroup" aria-label="How to set the price">
          {WAYS.map(({ mode: m, icon: Icon, title, says, moves }) => {
            const needsCost = m !== "price" && unitCost == null;
            const on = mode === m;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={needsCost}
                onClick={() => choose(m)}
                className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition disabled:opacity-50 ${
                  on ? "border-cacao bg-cacao/[0.06] ring-1 ring-cacao" : "border-line/20 bg-card hover:border-cacao/40"
                }`}
              >
                <span className={`flex items-center gap-2 text-[14px] font-semibold ${on ? "text-cacao" : ""}`}>
                  <Icon className="h-4 w-4" /> {title}
                </span>
                <span className="text-[12.5px]">{says}</span>
                <span className="text-[12px] text-muted-foreground">{needsCost ? "Needs the cost first — finish the recipe and its prices." : moves}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* The one box to fill in */}
      <div className="flex flex-col gap-2">
        <label className="flex flex-wrap items-center gap-2 text-[14px]">
          {mode === "price" && <span className="text-[18px] font-semibold text-muted-foreground">₱</span>}
          <input
            inputMode="decimal"
            value={value}
            onChange={(ev) => {
              setValue(ev.target.value.replace(/[^0-9.]/g, ""));
              setSaved(null);
            }}
            aria-label={mode === "price" ? "Selling price" : mode === "markup" ? "Markup percent" : "Margin percent"}
            placeholder="0"
            className={`${field} w-32 text-right`}
          />
          <span className="text-muted-foreground">
            {mode === "price"
              ? `a ${unit}`
              : mode === "markup"
                ? `% on top of the ${costText ?? "cost"} it costs to make`
                : "% of the price is yours to keep"}
          </span>
        </label>
        {mode === "price" && unitCost != null && (
          <div className="flex flex-wrap gap-2" aria-label="Quick prices">
            {(
              [
                ["Cost + 30%", 1.3],
                ["Cost + 50%", 1.5],
                ["Double the cost", 2],
              ] as const
            ).map(([label, k]) => {
              const suggested = Math.ceil(unitCost * k);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setValue(String(suggested));
                    setSaved(null);
                  }}
                  className="min-h-9 rounded-full border border-line/25 px-3 text-[12.5px] font-semibold transition hover:border-cacao hover:text-cacao"
                >
                  {label} · {formatPeso(suggested)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* What it comes to */}
      <div className="flex flex-col gap-1 rounded-xl bg-secondary/60 px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="text-[14px]">
            Sells for <span className="font-display text-[22px] font-bold tabular-nums">{r.price != null ? formatPeso(r.price) : "—"}</span>
          </span>
          {r.profit != null && (
            <span className={`text-[15px] font-semibold ${r.profit >= 0 ? "text-success" : "text-danger"}`}>
              {r.profit >= 0 ? `You keep ${formatPeso(r.profit)} a ${unit}` : `You lose ${formatPeso(-r.profit)} a ${unit}`}
            </span>
          )}
        </div>
        {r.markupPct != null && r.marginPct != null && (
          <span className="text-[12.5px] text-muted-foreground">
            That&apos;s a {r.markupPct}% markup on cost, or {r.marginPct}% of the price kept.
          </span>
        )}
        {r.price != null && unitCost == null && <span className="text-[12.5px] text-muted-foreground">Finish the recipe and its prices to see what you keep.</span>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={!changed} className="min-h-11 rounded-[10px] bg-cacao px-5 text-[14px] font-semibold text-ivory transition active:scale-[0.98] disabled:opacity-40">
          Save price
        </button>
        {saved && (
          <span role="status" className="text-[13px] font-semibold text-success">
            {saved}
          </span>
        )}
      </div>

      {/* Friend price */}
      <div className="flex flex-col gap-2 border-t border-line/10 pt-4">
        <span className="text-[14px] font-semibold">Friend price</span>
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          <span className="text-muted-foreground">₱</span>
          <input
            inputMode="decimal"
            value={friend}
            placeholder="Same as regular"
            onChange={(ev) => {
              setFriend(ev.target.value.replace(/[^0-9.]/g, ""));
              setSaved(null);
            }}
            aria-label="Friend price"
            className="h-10 w-32 rounded-lg border border-input bg-transparent px-3 text-right text-[15px] outline-none focus:border-cacao"
          />
          <span className="text-muted-foreground">a {unit}</span>
          {friendResult.profit != null && (
            <span className={`text-[13px] ${friendResult.profit < 0 ? "font-semibold text-danger" : "text-muted-foreground"}`}>
              {friendResult.profit >= 0 ? `· you keep ${formatPeso(friendResult.profit)}` : `· loses ${formatPeso(-friendResult.profit)}`}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              updateProduct(product.id, { friendPrice: Number(friend || 0) });
              setSaved("Saved the friend price.");
            }}
            disabled={!friendChanged}
            className="min-h-10 rounded-[10px] border border-line/20 px-4 text-[13px] font-semibold disabled:opacity-40"
          >
            Save friend price
          </button>
        </div>
      </div>
    </div>
  );
}
