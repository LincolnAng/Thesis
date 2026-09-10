"use client";

import { useState } from "react";
import { Factory, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDeleteButton } from "@/components/data-table/confirm-delete-button";
import { addMachine, deleteMachine, updateMachine } from "@/lib/store/store";
import { useNumericDraft } from "@/lib/use-numeric-draft";
import type { Machine } from "@/lib/store/types";

const DAY_OPTIONS = [
  { value: 5, label: "Mon–Fri" },
  { value: 6, label: "Mon–Sat" },
  { value: 7, label: "Every day" },
];

function daysLabel(days: number): string {
  return DAY_OPTIONS.find((d) => d.value === days)?.label ?? `${days} days a week`;
}

function MachineRow({ machine }: { machine: Machine }) {
  const capacityField = useNumericDraft(machine.batchesPerDay, (n) =>
    updateMachine(machine.id, { batchesPerDay: n }),
  );

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
        <Factory className="h-4 w-4 text-secondary-foreground" />
      </span>
      <Input
        className="h-8 w-40"
        value={machine.name}
        onChange={(e) => updateMachine(machine.id, { name: e.target.value })}
      />
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Input
          type="number"
          inputMode="decimal"
          className="h-8 w-16"
          value={capacityField.value}
          onChange={(e) => capacityField.onChange(e.target.value)}
        />
        batches a day
      </span>
      <select
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
        value={machine.workingDaysPerWeek}
        onChange={(e) => updateMachine(machine.id, { workingDaysPerWeek: Number(e.target.value) })}
      >
        {DAY_OPTIONS.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>
      <span className="ml-auto">
        <ConfirmDeleteButton onConfirm={() => deleteMachine(machine.id)} />
      </span>
    </li>
  );
}

export function MachinesPanel({ machines }: { machines: Machine[] }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    addMachine({ name: trimmed, batchesPerDay: 2, workingDaysPerWeek: 6, notes: "" });
    setName("");
    setAdding(false);
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Equipment</h2>
        {machines.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {machines.reduce((sum, m) => sum + m.batchesPerDay, 0)} batches a day at full run
          </p>
        )}
      </div>

      {machines.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">
          Add the equipment you make batches on. The plan below can only be worked out once it knows how much
          can be finished in a day.
        </p>
      )}

      {machines.length > 0 && (
        <ul className="divide-y divide-border">
          {machines.map((m) => (
            <MachineRow key={m.id} machine={m} />
          ))}
        </ul>
      )}

      {adding ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1 space-y-1">
            <Label className="text-xs text-muted-foreground">What is it?</Label>
            <Input
              autoFocus
              placeholder="Grinder, cooker, sealer…"
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
          <Plus className="h-4 w-4" /> Add equipment
        </Button>
      )}

      {machines.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {machines.map((m) => `${m.name}: ${m.batchesPerDay}/day, ${daysLabel(m.workingDaysPerWeek).toLowerCase()}`).join(" · ")}
        </p>
      )}
    </section>
  );
}
