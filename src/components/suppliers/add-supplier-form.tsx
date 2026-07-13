"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { addSupplier } from "@/lib/store/store";
import type { SupplierType } from "@/lib/store/types";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<SupplierType, string> = {
  raw_materials: "Ingredients",
  packaging: "Packaging",
};

const TYPES: SupplierType[] = ["raw_materials", "packaging"];

export function AddSupplierForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<SupplierType>("raw_materials");
  const [items, setItems] = useState("");
  const [lastPrice, setLastPrice] = useState(0);
  const [contact, setContact] = useState("");

  function save() {
    if (!name.trim()) return;
    addSupplier({ name: name.trim(), type, items: items.trim(), lastPrice, contact: contact.trim() });
    onDone();
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Supplier name</Label>
        <Input
          className="h-9"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Aling Nena's Market Stall"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Supplies</Label>
        <div className="flex gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium",
                type === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground",
              )}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">What do they supply?</Label>
        <Input className="h-9" value={items} onChange={(e) => setItems(e.target.value)} placeholder="e.g. Cocoa beans, sugar" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Current price (₱)</Label>
          <Input
            type="number"
            className="h-9"
            value={lastPrice}
            onChange={(e) => setLastPrice(Number(e.target.value) || 0)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Contact number</Label>
          <Input className="h-9" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="09xx-xxx-xxxx" />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" className="flex-1" onClick={save} disabled={!name.trim()}>
          Save
        </Button>
        <Button size="sm" variant="ghost" className="flex-1" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
