"use client";

import type { ReactNode } from "react";
import { ViewModeToggle } from "@/components/summary/view-mode-toggle";
import { SpreadsheetButton } from "@/components/settings/spreadsheet-button";

/**
 * Every page's frame: a title bar (title on the left; the page's main actions, the way out
 * to the spreadsheet and the Simple/Advanced switch on the right) over a padded content area.
 */
export function Page({
  title,
  right,
  children,
  hideModeToggle,
  subnav,
}: {
  title: string;
  /** A tab strip under the title bar, for pages that hold more than one view (Costing). */
  subnav?: ReactNode;
  /** Plain-words title for Simple mode, when it differs. */
  right?: ReactNode;
  children: ReactNode;
  hideModeToggle?: boolean;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 flex min-h-[76px] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line/10 bg-ivory/95 px-4 py-3 backdrop-blur min-[1024px]:px-8">
        <h1 className="font-display text-[24px] font-semibold">{title}</h1>
        <div className="flex flex-wrap items-center gap-2.5">
          {right}
          <SpreadsheetButton />
          {!hideModeToggle && <ViewModeToggle />}
        </div>
      </header>
      <div className="flex-1 px-4 py-7 min-[1024px]:px-8">
        {subnav && <div className="mb-6">{subnav}</div>}
        {children}
      </div>
    </div>
  );
}

/** Tab strip used inside pages (People, Inventory): grey track, white pill for the active tab. */
export function PageTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly (readonly [T, string])[];
  value: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="flex w-fit max-w-full gap-1.5 overflow-x-auto rounded-[10px] bg-secondary p-1">
      {tabs.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={`min-h-11 shrink-0 rounded-lg px-4 py-2 text-[13px] ${value === k ? "bg-card font-semibold shadow-sm" : "font-medium text-muted-foreground"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
