"use client";

import { useState } from "react";
import { useStore } from "@/lib/store/use-store";
import { setBusinessSetting } from "@/lib/store/store";
import { branchesOf, mainBranch } from "@/lib/inventory/branches";
import { branchPrice, branchPriceKey, freightKey, freightPerUnit, recommendedBranchPrices } from "@/lib/inventory/branch-prices";
import { evaluate, priceFor } from "@/lib/costing/price-calc";
import { formatPeso } from "@/lib/format";
import type { Product } from "@/lib/store/types";

/**
 * A price calculator for each branch other than the main one — Manila, where freight makes each
 * unit cost more, so it sells for more. Freight per unit is added to the cost; the price is then
 * typed, or worked out from a markup on that landed cost. Saving sets the price a sale at that
 * branch starts at (on Transactions, for everyone); the main price is unchanged.
 */
export function BranchPrices({ product, unitCost, mainPrice, unit }: { product: Product; unitCost: number | null; mainPrice: number; unit: string }) {
  const { businessSettings } = useStore();
  const branches = branchesOf(businessSettings);
  const others = branches.filter((b) => b.id !== mainBranch(branches).id);
  if (others.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 border-t border-line/10 pt-4">
      <div>
        <h3 className="text-[15px] font-semibold">Prices at other branches</h3>
        <p className="text-[12.5px] text-muted-foreground">
          {mainBranch(branches).name} sells at {formatPeso(mainPrice)}. Freight to another branch is added to the cost there, so its price can be higher.
        </p>
      </div>
      {others.map((b) => (
        <BranchCalc key={`${b.id}-${businessSettings[branchPriceKey(product.id, b.id)] ?? ""}`} productId={product.id} branchId={b.id} branchName={b.name} unitCost={unitCost} mainPrice={mainPrice} unit={unit} />
      ))}
    </div>
  );
}

function BranchCalc({ productId, branchId, branchName, unitCost, mainPrice, unit }: { productId: string; branchId: string; branchName: string; unitCost: number | null; mainPrice: number; unit: string }) {
  const { businessSettings } = useStore();
  const savedPrice = branchPrice(businessSettings, productId, branchId);
  const [freight, setFreight] = useState(String(freightPerUnit(businessSettings, productId, branchId) || ""));
  const [mode, setMode] = useState<"price" | "markup">("price");
  const [value, setValue] = useState(String(savedPrice ?? ""));
  const [saved, setSaved] = useState(false);

  const landed = unitCost != null ? Math.round((unitCost + (Number(freight) || 0)) * 100) / 100 : null;
  // What it should sell for there, worked out from freight — a suggestion to take or leave.
  const freightNum = Number(freight) || 0;
  const recommend = recommendedBranchPrices(mainPrice, unitCost, freightNum);
  const price = value === "" ? null : priceFor(mode, Number(value), landed);
  const r = evaluate(price, landed);

  function save() {
    setBusinessSetting(freightKey(productId, branchId), String(Number(freight) || 0));
    if (price != null && price > 0) setBusinessSetting(branchPriceKey(productId, branchId), String(price));
    setSaved(true);
  }

  const field = "h-10 rounded-lg border border-input bg-transparent px-2 text-right text-[15px] outline-none focus:border-cacao";
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-line/15 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[14px] font-semibold">{branchName}</span>
        <span className="text-[13px] text-muted-foreground">
          Sells for <span className="font-semibold text-foreground">{formatPeso(savedPrice ?? mainPrice)}</span>
          {savedPrice == null && ` (same as ${"main"} — no ${branchName} price yet)`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
        <label className="flex items-center gap-1.5">
          Freight per {unit} ₱
          <input inputMode="decimal" value={freight} onChange={(e) => (setFreight(e.target.value.replace(/[^0-9.]/g, "")), setSaved(false))} className={`${field} w-20`} />
        </label>
        <span className="text-muted-foreground">→ cost in {branchName}: {landed != null ? formatPeso(landed) : "— (recipe not fully priced)"}</span>
      </div>
      {freightNum > 0 && mainPrice > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg bg-secondary/60 px-3 py-2 text-[13px]">
          <span className="font-semibold">Suggested {branchName} price</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => (setMode("price"), setValue(String(recommend.sameProfit)), setSaved(false))}
              className="min-h-9 rounded-full border border-cacao/40 bg-card px-3 font-semibold text-cacao hover:bg-cacao/5"
            >
              {formatPeso(recommend.sameProfit)} — keeps the same ₱ profit a {unit}
            </button>
            {recommend.sameMargin != null && recommend.sameMargin !== recommend.sameProfit && (
              <button
                type="button"
                onClick={() => (setMode("price"), setValue(String(recommend.sameMargin)), setSaved(false))}
                className="min-h-9 rounded-full border border-line/25 bg-card px-3 font-semibold hover:border-cacao hover:text-cacao"
              >
                {formatPeso(recommend.sameMargin!)} — keeps the same margin %
              </button>
            )}
          </div>
          <span className="text-muted-foreground">Only a suggestion: tap one to try it, or type your own price below.</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
        <select value={mode} onChange={(e) => (setMode(e.target.value as "price" | "markup"), setValue(""), setSaved(false))} disabled={landed == null} className="h-10 rounded-lg border border-input bg-transparent px-2">
          <option value="price">Selling price ₱</option>
          <option value="markup">Markup on cost %</option>
        </select>
        <input inputMode="decimal" value={value} onChange={(e) => (setValue(e.target.value.replace(/[^0-9.]/g, "")), setSaved(false))} className={`${field} w-24`} />
        {r.price != null && <span className="font-semibold">= {formatPeso(r.price)}</span>}
        {r.profit != null && (
          <span className={r.profit >= 0 ? "text-success" : "font-semibold text-danger"}>
            {r.profit >= 0 ? `${formatPeso(r.profit)} profit a ${unit}` : `loses ${formatPeso(-r.profit)} a ${unit}`}
            {r.marginPct != null ? ` · ${r.marginPct}% margin` : ""}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} className="min-h-10 rounded-[10px] bg-cacao px-4 text-[13px] font-semibold text-ivory">
          Save {branchName} price
        </button>
        {saved && <span className="text-[13px] font-semibold text-success">Saved.</span>}
      </div>
    </div>
  );
}
