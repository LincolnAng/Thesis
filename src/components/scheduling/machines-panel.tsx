"use client";

import { SearchSelect } from "@/components/ui/search-select";
import { useState } from "react";
import { Factory, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingNumberInput } from "@/components/ui/setting-number-input";
import { ConfirmDeleteButton } from "@/components/data-table/confirm-delete-button";
import { addMachine, deleteMachine, updateMachine } from "@/lib/store/store";
import { useStore } from "@/lib/store/use-store";
import { fullName } from "@/lib/summary/product-sizes";
import { hoursOf, outputsOf, perDay } from "@/lib/production/machines";
import type { Machine, MachineOutput } from "@/lib/store/types";

const DAY_OPTIONS = [
  { value: 5, label: "Mon–Fri" },
  { value: 6, label: "Mon–Sat" },
  { value: 7, label: "Every day" },
];

const SELECT = "h-8 rounded-md border border-input bg-transparent px-2 text-sm";

/** What can be picked as a machine's output: every product (each size its own) and every raw material. */
function useItems() {
  const { products, rawMaterials } = useStore();
  const items = [
    ...products.map((p) => ({ key: `product:${p.id}`, id: p.id, kind: "product" as const, name: fullName(p, products), unit: p.unit || "jars" })),
    ...rawMaterials.map((m) => ({ key: `material:${m.id}`, id: m.id, kind: "material" as const, name: m.name, unit: m.unit || "units" })),
  ];
  return items;
}

function OutputRow({
  machine,
  output,
  index,
  items,
}: {
  machine: Machine;
  output: MachineOutput;
  index: number;
  items: ReturnType<typeof useItems>;
}) {
  const outputs = outputsOf(machine);
  const set = (patch: Partial<MachineOutput>) =>
    updateMachine(machine.id, { outputs: outputs.map((o, i) => (i === index ? { ...o, ...patch } : o)) });
  const item = items.find((x) => x.id === output.itemId && x.kind === output.kind);

  return (
    <li className="flex flex-wrap items-center gap-2 py-1.5">
      <div className="min-w-0 flex-1 basis-40">
        <SearchSelect
          className="h-8 rounded-md px-2 text-sm"
          value={item ? item.key : ""}
          onChange={(key) => {
            const next = items.find((x) => x.key === key);
            if (next) set({ itemId: next.id, kind: next.kind });
          }}
          placeholder="Pick what it makes…"
          ariaLabel="What it makes"
          options={[
            ...items.filter((x) => x.kind === "product").map((x) => ({ value: x.key, label: x.name, group: "Products" })),
            ...items.filter((x) => x.kind === "material").map((x) => ({ value: x.key, label: x.name, group: "Raw materials" })),
          ]}
        />
      </div>
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <SettingNumberInput className="h-8 w-20" value={output.qty} onCommit={(n) => set({ qty: Math.max(0, n) })} />
        <span className="max-w-[5rem] truncate">{item?.unit ?? "units"}</span>
        <select className={SELECT} value={output.per} onChange={(e) => set({ per: e.target.value === "hour" ? "hour" : "day" })}>
          <option value="hour">an hour</option>
          <option value="day">a day</option>
        </select>
      </span>
      <button
        type="button"
        aria-label="Remove"
        onClick={() => updateMachine(machine.id, { outputs: outputs.filter((_, i) => i !== index) })}
        className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}

function MachineCard({ machine, items }: { machine: Machine; items: ReturnType<typeof useItems> }) {
  const [name, setName] = useState(machine.name);
  const outputs = outputsOf(machine);
  const summary = outputs
    .filter((o) => perDay(machine, o) > 0)
    .map((o) => {
      const item = items.find((x) => x.id === o.itemId && x.kind === o.kind);
      return item ? `${Math.round(perDay(machine, o) * 100) / 100} ${item.unit} of ${item.name}` : null;
    })
    .filter(Boolean);

  return (
    <li className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
          <Factory className="h-4 w-4 text-secondary-foreground" />
        </span>
        <Input
          className="h-8 min-w-0 flex-1 basis-32 font-medium"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== machine.name && updateMachine(machine.id, { name: name.trim() })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <select
          className={SELECT}
          value={machine.workingDaysPerWeek}
          onChange={(e) => updateMachine(machine.id, { workingDaysPerWeek: Number(e.target.value) })}
        >
          {DAY_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <SettingNumberInput className="h-8 w-14" value={hoursOf(machine)} onCommit={(n) => n > 0 && n <= 24 && updateMachine(machine.id, { hoursPerDay: n })} />
          h a day
        </span>
        <ConfirmDeleteButton onConfirm={() => deleteMachine(machine.id)} />
      </div>

      <div className="pl-10">
        <p className="text-xs font-semibold text-muted-foreground">Makes</p>
        {outputs.length > 0 && (
          <ul>
            {outputs.map((o, i) => (
              <OutputRow key={i} machine={machine} output={o} index={i} items={items} />
            ))}
          </ul>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="mt-1 gap-1 px-2"
          disabled={items.length === 0}
          onClick={() => {
            const first = items[0];
            if (first) updateMachine(machine.id, { outputs: [...outputs, { itemId: first.id, kind: first.kind, qty: 0, per: "hour" }] });
          }}
        >
          <Plus className="h-4 w-4" /> {outputs.length ? "Something else it makes" : "What it makes"}
        </Button>
        {summary.length > 0 && <p className="mt-1 text-xs text-muted-foreground">A full day: {summary.join(" or ")}</p>}
      </div>
    </li>
  );
}

/**
 * The machines the owner bought, what each one makes (products or raw materials) and how many
 * an hour or a day. The schedule places work only on a machine that makes it.
 */
export function MachinesPanel({ machines }: { machines: Machine[] }) {
  const items = useItems();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    addMachine({ name: trimmed, outputs: [], hoursPerDay: 8, workingDaysPerWeek: 6, notes: "" });
    setName("");
    setAdding(false);
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Machines</h2>
        <p className="text-xs text-muted-foreground">What you make with, what each one makes, and how many an hour or a day.</p>
      </div>

      {machines.length > 0 && (
        <ul className="space-y-2">
          {machines.map((m) => (
            <MachineCard key={m.id} machine={m} items={items} />
          ))}
        </ul>
      )}

      {adding ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1 space-y-1">
            <Label className="text-xs text-muted-foreground">What is it?</Label>
            <Input
              autoFocus
              placeholder="Grinder, roaster, sealer…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <Button size="sm" disabled={!name.trim()} onClick={submit}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="secondary" className="gap-1" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add machine
        </Button>
      )}
    </section>
  );
}
