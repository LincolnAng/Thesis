"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { useStore } from "@/lib/store/use-store";
import { addRawMaterial, updateRawMaterial } from "@/lib/store/store";
import { cacaoUtilizationPct, setCacaoUtilizationPct } from "@/lib/summary/business-config";
import { allStandings, kindForGroup, usedBy, type MaterialGroup } from "@/lib/summary/material-stock";
import { isRawCacao } from "@/lib/summary/cacao";
import { formatNumber, formatPrice } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * What goes into a jar, and what the jar is.
 *
 * These were one undifferentiated "raw materials" list, which put cocoa beans next to sticker
 * labels although almost nothing about them is alike: one is bought by weight, loses a share of
 * itself to roasting, and drives the cost of the recipe; the other is counted in pieces and
 * loses nothing. Splitting them is not tidying — it is what lets roasting loss apply to the
 * things it actually applies to.
 *
 * Both lists are read from her purchases. On hand is what she bought minus what her batches
 * used; the price is the average of what is still on the shelf. Neither is a number anybody has
 * to remember to update, which is the point: the old stored figures were right until the first
 * time something was missed, and then wrong forever.
 */

const EMPTY_COPY: Record<MaterialGroup, { title: string; blurb: string }> = {
  ingredient: {
    title: "Nothing bought yet",
    blurb: "Log what you buy under Money and it appears here, with what it cost you.",
  },
  supply: {
    title: "Nothing bought yet",
    blurb: "Jars, labels, lids — log a purchase under Money and it shows up here.",
  },
};

function UtilizationSlider() {
  const { businessSettings } = useStore();
  const pct = cacaoUtilizationPct(businessSettings);
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      <span className="text-cacao">roasting loss</span>
      <input
        type="range"
        min={5}
        max={100}
        step={1}
        value={pct}
        onChange={(e) => setCacaoUtilizationPct(Number(e.target.value))}
        className="h-1 w-24 accent-[#7B4B2A]"
        aria-label="Share of raw cacao that is usable after roasting"
      />
      <span className="font-semibold text-ink">{`${pct}% usable`}</span>
      <span className="hidden min-[1200px]:inline">{`— 1 kg in a recipe uses ${(1 / (pct / 100)).toFixed(2)} kg of beans`}</span>
    </span>
  );
}

function AddRow({ group, onDone }: { group: MaterialGroup; onDone: () => void }) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState(group === "supply" ? "pcs" : "kg");

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    addRawMaterial({
      name: trimmed,
      unit: unit.trim() || "pcs",
      qty: 0,
      lowStockThreshold: 0,
      perBatchQty: null,
      color: null,
      unitCost: 0,
      kind: kindForGroup(group),
    });
    onDone();
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line/15 p-3">
      <div className="min-w-[12rem] flex-1 space-y-1">
        <label className="text-xs text-muted-foreground">Name</label>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9"
          placeholder={group === "supply" ? "e.g. 250ml jars" : "e.g. Cocoa beans"}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
      </div>
      <div className="w-24 space-y-1">
        <label className="text-xs text-muted-foreground">Measured in</label>
        <Input value={unit} onChange={(e) => setUnit(e.target.value)} className="h-9" placeholder="kg" />
      </div>
      <Button size="sm" className="h-9" disabled={!name.trim()} onClick={save}>
        Add
      </Button>
      <Button size="sm" variant="ghost" className="h-9" onClick={onDone}>
        Cancel
      </Button>
    </div>
  );
}

const COLS = "grid grid-cols-[minmax(0,1.6fr)_100px_120px_minmax(0,1.1fr)_36px] items-center gap-3";

export function MaterialsPanel({ group }: { group: MaterialGroup }) {
  const { rawMaterials, entries, products, businessSettings } = useStore();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const utilization = cacaoUtilizationPct(businessSettings) / 100;

  const rows = useMemo(
    () => allStandings(entries, products, rawMaterials, utilization).filter((r) => r.group === group),
    [entries, products, rawMaterials, utilization, group],
  );

  return (
    <div className="rounded-2xl border border-line/15 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[17px] font-semibold">
              {group === "ingredient" ? "Raw materials" : "Supplies"}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {group === "ingredient"
                ? "What goes in the jar. On hand and price come from what you bought, minus what your batches used."
                : "What the jar is. On hand and price come from what you bought, minus what your batches used."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-1.5 rounded-[10px] border border-cacao/30 px-3 py-2 text-xs font-semibold text-cacao hover:bg-cacao/[0.06]"
          >
            <Plus className="h-3.5 w-3.5" />
            {group === "ingredient" ? "Add an ingredient" : "Add a supply"}
          </button>
        </div>

        {adding && (
          <div className="mt-3">
            <AddRow group={group} onDone={() => setAdding(false)} />
          </div>
        )}

        {rows.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-line/25 px-4 py-6 text-center">
            <div className="text-sm font-semibold">{EMPTY_COPY[group].title}</div>
            <p className="mt-1 text-[13px] text-muted-foreground">{EMPTY_COPY[group].blurb}</p>
          </div>
        ) : (
          <>
            <div
              className={`${COLS} mt-4 border-b border-line/10 pb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground`}
            >
              <span>Name</span>
              <span className="text-right">On hand</span>
              <span className="text-right">Average cost</span>
              <span>Used in</span>
              <span />
            </div>

            {rows.map((r) => {
              const uses = usedBy(r.material, products);
              return (
                <div key={r.material.id} className={`${COLS} border-b border-line/10 py-2.5 text-[13px] last:border-0`}>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{r.material.name}</span>
                    {isRawCacao(r.material.name) && <UtilizationSlider />}
                  </span>

                  <span className="text-right tabular-nums">
                    {r.tracked ? (
                      <span className={r.onHand <= 0 ? "font-semibold text-danger" : "font-semibold"}>
                        {`${formatNumber(Math.round(r.onHand * 100) / 100)} ${r.material.unit}`}
                      </span>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">not bought yet</span>
                    )}
                  </span>

                  <span className="text-right tabular-nums">
                    {r.avgCost !== null ? (
                      <>
                        <span className="font-semibold">{formatPrice(r.avgCost)}</span>
                        <span className="text-[11px] text-muted-foreground">{` / ${r.material.unit}`}</span>
                      </>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">no price yet</span>
                    )}
                  </span>

                  <span className="truncate text-[12px] text-muted-foreground">
                    {uses.length ? uses.map((p) => p.name).join(", ") : "no recipe uses it"}
                  </span>

                  <span className="flex justify-end">
                    <button
                      type="button"
                      aria-label={`Edit ${r.material.name}`}
                      onClick={() => setEditingId(editingId === r.material.id ? null : r.material.id)}
                      className="rounded-md p-1 text-muted-foreground hover:text-cacao"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </span>

                  {editingId === r.material.id && (
                    <div className="col-span-5 mt-1 flex flex-wrap items-end gap-2 rounded-xl border border-line/15 p-3">
                      <div className="min-w-[12rem] flex-1 space-y-1">
                        <label className="text-xs text-muted-foreground">Name</label>
                        <Input
                          defaultValue={r.material.name}
                          className="h-9"
                          onBlur={(e) => updateRawMaterial(r.material.id, { name: e.target.value.trim() || r.material.name })}
                        />
                      </div>
                      <div className="w-24 space-y-1">
                        <label className="text-xs text-muted-foreground">Measured in</label>
                        <Input
                          defaultValue={r.material.unit}
                          className="h-9"
                          onBlur={(e) => updateRawMaterial(r.material.id, { unit: e.target.value.trim() || r.material.unit })}
                        />
                      </div>
                      <div className="w-36 space-y-1">
                        <label className="text-xs text-muted-foreground">Counts as</label>
                        <select
                          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                          value={r.group}
                          onChange={(e) =>
                            updateRawMaterial(r.material.id, { kind: kindForGroup(e.target.value as MaterialGroup) })
                          }
                        >
                          <option value="ingredient">Ingredient</option>
                          <option value="supply">Supply</option>
                        </select>
                      </div>
                      <Button size="sm" variant="ghost" className="h-9" onClick={() => setEditingId(null)}>
                        Done
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {rows.some((r) => r.skipped > 0) && (
          <p className="mt-3 text-[11px] text-danger">
            Some purchases were logged in a unit that couldn&apos;t be converted, so they aren&apos;t counted above.
            Check the units on those expenses.
          </p>
        )}
    </div>
  );
}
