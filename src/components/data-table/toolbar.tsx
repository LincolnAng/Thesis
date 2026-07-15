"use client";

import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";

export interface ToolbarFilter {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

export function Toolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search…",
  filters,
  onAdd,
  addLabel,
}: {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ToolbarFilter[];
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {onAdd && (
          <Button size="sm" className="gap-1 sm:shrink-0" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5" /> {addLabel}
          </Button>
        )}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
          />
        </div>
      </div>
      {filters?.map((filter) => (
        <div key={filter.label} className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{filter.label}</p>
          <ChipGroup
            options={filter.options.map((o) => o.value)}
            value={filter.value}
            labels={Object.fromEntries(filter.options.map((o) => [o.value, o.label]))}
            onChange={filter.onChange}
          />
        </div>
      ))}
    </div>
  );
}
