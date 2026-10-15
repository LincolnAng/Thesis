"use client";

import { useState } from "react";
import { updateProduct } from "@/lib/store/store";
import { evaluate, priceFor, type CalcMode } from "@/lib/costing/price-calc";
import { MAX_MARGIN_PCT } from "@/lib/summary/pricing-methods";
import { formatPeso } from "@/lib/format";
import type { PricingMode, Product } from "@/lib/store/types";

/**
 * One product's price calculator, inside its costing page. Try a price three ways — type it,
 * or work it out from a markup on cost or a target margin — and the preview updates as you
 * type. Nothing changes the product's price until "Save as the selling price" is pressed.
 *
 * Saving a markup or margin keeps the price following the cost, as before (it moves when
 * ingredient prices do); saving a typed price fixes it. Past sales keep the price they were
 * sold at either way — a transaction stores its own amount.
 */

const MODE_FOR_SAVE: Record<CalcMode, PricingMode> = { price: "manual", markup: "cost_percent", margin: "margin" };

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-secondary px-3 py-2">
      <div className="text-[11.5px] font-semibold text-muted-foreground">{label}</div>
      <div className={`text-[16px] font-bold tabular-nums ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

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
  /** Cost per finished unit, or null when it can't be worked out yet. */
  unitCost: number | null;
  /** The price the product sells for now. */
  currentPrice: number;
  unit: string;
}) {
  const [mode, setMode] = useState<CalcMode>(startingMode(product));
  const [value, setValue] = useState(() =>
    String(startingMode(product) === "price" ? currentPrice || "" : product.marginPercent || ""),
  );
  const [friend, setFriend] = useState(product.friendPrice ? String(product.friendPrice) : "");
  const [saved, setSaved] = useState<string | null>(null);

  const typed = Number(value);
  const price = value === "" ? null : priceFor(mode, typed, unitCost);
  const r = evaluate(price, unitCost);
  const changed =
    price != null &&
    (Math.abs(price - currentPrice) >= 0.01 || MODE_FOR_SAVE[mode] !== product.pricingMode || (mode !== "price" && typed !== product.marginPercent));
  const tiersChanged = Number(friend || 0) !== product.friendPrice;

  function switchMode(next: CalcMode) {
    // Carry the price on screen into the new way of describing it, so switching never jumps.
    const carry =
      next === "price" ? price : next === "markup" ? evaluate(price, unitCost).markupPct : evaluate(price, unitCost).marginPct;
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
    setSaved(`Saved — ${formatPeso(price)} a ${unit} is now the selling price.`);
  }

  function saveTiers() {
    // Only the friend price is set here; a wholesale price saved before stays in the records.
    updateProduct(product.id, { friendPrice: Number(friend || 0) });
    setSaved("Saved the friend price.");
  }

  const field = "h-11 rounded-lg border border-input bg-transparent px-3 text-[15px] outline-none focus:border-cacao";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13.5px]">
        Selling now for <span className="font-semibold">{currentPrice > 0 ? formatPeso(currentPrice) : "— no price yet"}</span>
        {product.pricingMode !== "manual" && currentPrice > 0 && (
          <span className="text-muted-foreground">
            {" "}
            · follows the cost at {product.marginPercent}% {product.pricingMode === "margin" ? "margin" : "markup"}
          </span>
        )}
      </p>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-muted-foreground">Work out a price by…</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How to work out the price">
          {(
            [
              ["price", "Typing a price"],
              ["markup", "Markup on cost"],
              ["margin", "Target margin"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => switchMode(m)}
              disabled={m !== "price" && unitCost == null}
              className={`min-h-10 rounded-full border px-3.5 text-[13px] font-semibold transition disabled:opacity-40 ${
                mode === m ? "border-cacao bg-cacao text-ivory" : "border-line/20 bg-card"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {unitCost == null && (
          <p className="text-[12px] text-[#9A6B12]">Markup and margin need the cost per {unit}, which isn&apos;t known until the recipe is complete and priced.</p>
        )}
        <label className="flex items-center gap-2">
          {mode === "price" && <span className="text-[15px]">₱</span>}
          <input
            inputMode="decimal"
            value={value}
            onChange={(ev) => {
              setValue(ev.target.value.replace(/[^0-9.]/g, ""));
              setSaved(null);
            }}
            aria-label={mode === "price" ? "Selling price" : mode === "markup" ? "Markup percent" : "Margin percent"}
            className={`${field} w-32 text-right`}
          />
          <span className="text-[14px] text-muted-foreground">{mode === "price" ? `a ${unit}` : mode === "markup" ? "% markup" : "% margin"}</span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2 min-[700px]:grid-cols-5">
        <Stat label={`Cost per ${unit}`} value={r.cost != null ? formatPeso(r.cost) : "—"} />
        <Stat label="Selling price" value={r.price != null ? formatPeso(r.price) : "—"} tone="text-cacao" />
        <Stat label="Markup" value={r.markupPct != null ? `${r.markupPct}%` : "—"} />
        <Stat label="Gross margin" value={r.marginPct != null ? `${r.marginPct}%` : "—"} />
        <Stat
          label={`Profit per ${unit}`}
          value={r.profit != null ? formatPeso(r.profit) : "—"}
          tone={r.profit == null ? "" : r.profit >= 0 ? "text-success" : "text-danger"}
        />
      </div>
      {r.profit != null && r.profit < 0 && <p className="text-[13px] font-semibold text-danger">This price is below what it costs to make.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!changed}
          className="min-h-11 rounded-[10px] bg-cacao px-5 text-[14px] font-semibold text-ivory disabled:opacity-40"
        >
          Save as the selling price
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(startingMode(product));
            setValue(String(startingMode(product) === "price" ? currentPrice || "" : product.marginPercent || ""));
            setSaved(null);
          }}
          className="min-h-11 rounded-[10px] border border-line/20 px-4 text-[14px] font-semibold"
        >
          Reset
        </button>
      </div>

      <div className="flex flex-col gap-2 border-t border-line/10 pt-3">
        <span className="text-[13px] font-semibold text-muted-foreground">Other prices</span>
        <div className="flex flex-wrap items-end gap-3">
          {(
            [
              ["Friend price", friend, setFriend],
            ] as const
          ).map(([label, v, set]) => {
            const tier = evaluate(v === "" ? null : Number(v), unitCost);
            return (
              <label key={label} className="flex flex-col gap-1">
                <span className="text-[13px]">{label} (₱)</span>
                <input
                  inputMode="decimal"
                  value={v}
                  onChange={(ev) => {
                    set(ev.target.value.replace(/[^0-9.]/g, ""));
                    setSaved(null);
                  }}
                  className={`${field} w-32 text-right`}
                />
                <span className={`text-[12px] ${tier.profit != null && tier.profit < 0 ? "font-semibold text-danger" : "text-muted-foreground"}`}>
                  {tier.profit == null ? " " : tier.profit >= 0 ? `${formatPeso(tier.profit)} profit a ${unit}` : `Loses ${formatPeso(-tier.profit)} a ${unit}`}
                </span>
              </label>
            );
          })}
          <button
            type="button"
            onClick={saveTiers}
            disabled={!tiersChanged}
            className="mb-5 min-h-11 rounded-[10px] border border-line/20 px-4 text-[14px] font-semibold disabled:opacity-40"
          >
            Save friend price
          </button>
        </div>
      </div>

      {saved && (
        <p role="status" className="text-[14px] font-semibold text-success">
          {saved}
        </p>
      )}
    </div>
  );
}
