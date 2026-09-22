"use client";

import { useState, type ReactNode } from "react";

export interface PeopleColumn {
  label: string;
  align?: "right";
  /** CSS grid track, e.g. "1.6fr" or "110px". Defaults to 1fr. */
  width?: string;
}

export interface PeopleRow {
  key: string;
  cells: ReactNode[];
  /** Shown under the row when it's opened. Omit for rows that open a dialog instead. */
  detail?: ReactNode;
  onOpen?: () => void;
  muted?: boolean;
}

/** A plain table: one row per person or event. Click a row to see its details underneath. */
export function PeopleTable({ columns, rows, empty }: { columns: PeopleColumn[]; rows: PeopleRow[]; empty: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const grid = { gridTemplateColumns: `${columns.map((c) => c.width ?? "1fr").join(" ")} 20px` };

  return (
    <div className="overflow-x-auto rounded-2xl border border-line/15 bg-white">
      <div className="min-w-[640px]">
        <div className="grid gap-4 bg-secondary px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground" style={grid}>
          {columns.map((c) => (
            <span key={c.label} className={c.align === "right" ? "text-right" : ""}>
              {c.label}
            </span>
          ))}
          <span />
        </div>
        {rows.length === 0 && <div className="border-t border-line/10 px-5 py-10 text-center text-sm text-muted-foreground">{empty}</div>}
        {rows.map((r) => {
          const isOpen = open === r.key;
          return (
            <div key={r.key} className="border-t border-line/10">
              <button
                type="button"
                onClick={() => (r.onOpen ? r.onOpen() : setOpen(isOpen ? null : r.key))}
                className={`grid w-full items-center gap-4 px-5 py-3 text-left text-[13px] ${isOpen ? "bg-cacao/[0.04]" : "hover:bg-ivory"} ${r.muted ? "text-muted-foreground" : ""}`}
                style={grid}
              >
                {r.cells.map((c, i) => (
                  <span key={i} className={`min-w-0 ${columns[i]?.align === "right" ? "text-right" : ""}`}>
                    {c}
                  </span>
                ))}
                <span className={`text-xs text-muted-foreground transition ${isOpen ? "rotate-90" : ""}`}>›</span>
              </button>
              {isOpen && r.detail && <div className="bg-cacao/[0.04] px-5 pb-4 pt-1">{r.detail}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The few headline numbers above a table, centered under their labels. */
export function PeopleSummary({ items, right }: { items: { label: string; value: string }[]; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-wrap gap-8">
        {items.map((i) => (
          <div key={i.label} className="text-center">
            <div className="text-xs font-semibold text-muted-foreground">{i.label}</div>
            <div className="font-display text-[22px] font-semibold">{i.value}</div>
          </div>
        ))}
      </div>
      {right}
    </div>
  );
}
