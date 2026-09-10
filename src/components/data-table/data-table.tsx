"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronsUpDown, ChevronUp, Download, Rows2, Rows3 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { downloadCsv, toCsv } from "@/lib/export-csv";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  className?: string;
  /** Keeps a column from being squeezed to the point of clipping its own header —
   * "Total sp…" and "Ingredien…" were the symptom. Defaults per column kind below. */
  minWidth?: number;
  render: (row: T) => ReactNode;
  /** Makes the header sortable. Return a number or string to sort by. */
  sortValue?: (row: T) => number | string;
  /** Renders a pinned totals row at the foot of the table for this column. */
  total?: (rows: T[]) => ReactNode;
  /** Excluded from CSV export when false — for action or chart-only columns. */
  exportValue?: (row: T) => string | number;
}

/** Sensible floors by column name, so callers only set minWidth when they differ. */
function defaultMinWidth(key: string, header: string): number {
  const text = `${key} ${header}`.toLowerCase();
  if (/amount|total|price|cost|spent|revenue|profit/.test(text)) return 90;
  if (/date|last|when/.test(text)) return 100;
  if (/category|type|status|level/.test(text)) return 100;
  return 160;
}

type SortState = { key: string; dir: "asc" | "desc" } | null;

export function DataTable<T>({
  columns,
  rows,
  keyFor,
  emptyMessage,
  renderRowActions,
  onRowClick,
  exportName,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  keyFor: (row: T) => string;
  emptyMessage: string;
  renderRowActions?: (row: T) => ReactNode;
  /** Makes rows navigable — this is what turns a table into a filter for another page. */
  onRowClick?: (row: T) => void;
  /** Enables the CSV button, using this as the file name. */
  exportName?: string;
}) {
  const [sort, setSort] = useState<SortState>(null);
  const [dense, setDense] = useState(true);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
      return String(av).localeCompare(String(bv)) * factor;
    });
  }, [rows, sort, columns]);

  function toggleSort(key: string) {
    setSort((prev) =>
      prev?.key === key ? (prev.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" },
    );
  }

  function handleExport() {
    const cols = columns.filter((c) => c.exportValue);
    const headers = cols.map((c) => c.header);
    const body = sorted.map((row) => cols.map((c) => c.exportValue!(row)));
    downloadCsv(exportName ?? "export", toCsv(headers, body));
  }

  const hasTotals = columns.some((c) => c.total);
  const cellPad = dense ? "py-1.5 text-[13px]" : "py-3 text-sm";

  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius-panel)] border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {(exportName || true) && (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={dense ? "Comfortable rows" : "Compact rows"}
            title={dense ? "Comfortable rows" : "Compact rows"}
            onClick={() => setDense((v) => !v)}
          >
            {dense ? <Rows3 className="h-4 w-4 text-muted-foreground" /> : <Rows2 className="h-4 w-4 text-muted-foreground" />}
          </Button>
          {exportName && (
            <Button size="icon-sm" variant="ghost" aria-label="Export CSV" title="Export CSV" onClick={handleExport}>
              <Download className="h-4 w-4 text-muted-foreground" />
            </Button>
          )}
        </div>
      )}

      <div className="max-h-[70vh] overflow-auto rounded-[var(--radius-panel)] border border-border bg-card">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => {
                const sortable = Boolean(col.sortValue);
                const active = sort?.key === col.key;
                return (
                  <TableHead
                    key={col.key}
                    style={{ minWidth: col.minWidth ?? defaultMinWidth(col.key, col.header) }}
                    className={cn(
                      "h-9 whitespace-nowrap text-[13px]",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-foreground",
                          col.align === "right" && "flex-row-reverse",
                          active && "text-foreground",
                        )}
                      >
                        {col.header}
                        {active ? (
                          sort!.dir === "asc" ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </TableHead>
                );
              })}
              {renderRowActions && <TableHead className="h-9 w-0" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row) => (
              <TableRow
                key={keyFor(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(onRowClick && "cursor-pointer")}
              >
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(
                      cellPad,
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.className,
                    )}
                  >
                    {col.render(row)}
                  </TableCell>
                ))}
                {renderRowActions && (
                  <TableCell className={cn(cellPad, "text-right")} onClick={(e) => e.stopPropagation()}>
                    {renderRowActions(row)}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
          {hasTotals && (
            <tfoot className="sticky bottom-0 bg-card">
              <TableRow className="border-t hover:bg-transparent">
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(
                      "py-2 text-[13px] font-semibold",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                    )}
                  >
                    {col.total ? col.total(sorted) : null}
                  </TableCell>
                ))}
                {renderRowActions && <TableCell />}
              </TableRow>
            </tfoot>
          )}
        </Table>
      </div>
    </div>
  );
}
