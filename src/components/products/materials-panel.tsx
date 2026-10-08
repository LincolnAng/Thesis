"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store/use-store";
import { addRawMaterial, updateRawMaterial } from "@/lib/store/store";
import { cacaoUtilizationPct, setCacaoUtilizationPct } from "@/lib/summary/business-config";
import { allStandings, kindForGroup, usedBy, type MaterialGroup } from "@/lib/summary/material-stock";
import { isRawCacao } from "@/lib/summary/cacao";
import { CARD_GRADIENTS, ItemIcon } from "@/lib/summary/item-icons";
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
    <>
      <div className="mb-3 mt-8 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {group === "ingredient" ? "Raw materials" : "Supplies"}
      </div>

      {adding && (
        <div className="mb-3">
          <AddRow group={group} onDone={() => setAdding(false)} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-[18px] min-[600px]:grid-cols-2 min-[1000px]:grid-cols-3 min-[1300px]:grid-cols-4">
        {rows.map((r, i) => {
          const uses = usedBy(r.material, products);
          const cacao = isRawCacao(r.material.name);
          const open = editingId === r.material.id;
          return (
            <div
              key={r.material.id}
              className="flex flex-col overflow-hidden rounded-2xl border border-line/15 bg-white transition hover:border-cacao/40 hover:shadow-sm"
            >
              <div className={`flex h-[120px] items-center justify-center bg-gradient-to-br ${CARD_GRADIENTS[i % CARD_GRADIENTS.length]}`}>
                <ItemIcon name={r.material.name} className="h-10 w-10 text-white/90" />
              </div>

              <button
                type="button"
                onClick={() => setEditingId(open ? null : r.material.id)}
                title={`Edit ${r.material.name}`}
                className="flex flex-col gap-1.5 p-4 text-left"
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <span className="text-sm font-semibold">{r.material.name}</span>
                  <span className="shrink-0 text-[11px] font-semibold text-faint">Edit</span>
                </div>

                <div className="flex w-full items-center justify-between gap-2 text-[13px]">
                  <span className="font-bold">
                    {r.avgCost !== null ? (
                      <>
                        {formatPrice(r.avgCost)}
                        <span className="text-[11px] font-normal text-muted-foreground">{` / ${r.material.unit}`}</span>
                      </>
                    ) : (
                      <span className="text-[12px] font-normal text-muted-foreground">no price yet</span>
                    )}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      !r.tracked
                        ? "bg-secondary text-muted-foreground"
                        : r.onHand <= 0
                          ? "bg-danger/10 text-danger"
                          : "bg-success/10 text-success"
                    }`}
                  >
                    {r.tracked
                      ? `${formatNumber(Math.round(r.onHand * 100) / 100)} ${r.material.unit}`
                      : "not bought yet"}
                  </span>
                </div>

                <div className="truncate text-xs text-muted-foreground">
                  {uses.length ? `Used in ${uses.map((p) => p.name).join(", ")}` : "No recipe uses it yet"}
                </div>
              </button>

              {cacao && (
                <div className="border-t border-line/10 px-4 py-2.5">
                  <UtilizationSlider />
                </div>
              )}

              {open && (
                <div className="flex flex-col gap-2 border-t border-line/10 p-4">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Name</label>
                    <Input
                      defaultValue={r.material.name}
                      className="h-9"
                      onBlur={(e) => updateRawMaterial(r.material.id, { name: e.target.value.trim() || r.material.name })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="w-24 space-y-1">
                      <label className="text-xs text-muted-foreground">Measured in</label>
                      <Input
                        defaultValue={r.material.unit}
                        className="h-9"
                        onBlur={(e) => updateRawMaterial(r.material.id, { unit: e.target.value.trim() || r.material.unit })}
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="text-xs text-muted-foreground">Counts as</label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                        value={r.group}
                        onChange={(e) =>
                          updateRawMaterial(r.material.id, { kind: kindForGroup(e.target.value as MaterialGroup) })
                        }
                      >
                        <option value="ingredient">Raw material</option>
                        <option value="supply">Supply</option>
                      </select>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-9 self-start" onClick={() => setEditingId(null)}>
                    Done
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="min-h-[220px] rounded-2xl border border-dashed border-line/25 text-sm font-semibold text-muted-foreground transition hover:border-cacao/40 hover:text-cacao"
        >
          {group === "ingredient" ? "+ Add a raw material" : "+ Add a supply"}
        </button>
      </div>

      {rows.some((r) => r.skipped > 0) && (
        <p className="mt-3 text-[11px] text-danger">
          Some purchases were logged in a unit that couldn&apos;t be converted, so they aren&apos;t counted above.
          Check the units on those expenses.
        </p>
      )}
    </>
  );
}
