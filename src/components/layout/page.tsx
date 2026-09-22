import type { ReactNode } from "react";

/**
 * Every page's frame: a title bar (title on the left, the page's main actions on the
 * right) over a padded content area. One frame everywhere, so each page opens the same way.
 */
export function Page({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 flex min-h-[76px] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line/10 bg-ivory/95 px-4 py-3 backdrop-blur min-[1024px]:px-8">
        <h1 className="font-display text-[24px] font-semibold">{title}</h1>
        {right && <div className="flex flex-wrap items-center gap-2.5">{right}</div>}
      </header>
      <div className="flex-1 px-4 py-7 min-[1024px]:px-8">{children}</div>
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
    <div className="flex w-fit gap-1.5 rounded-[10px] bg-secondary p-1">
      {tabs.map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={`rounded-lg px-4 py-2 text-[13px] ${value === k ? "bg-white font-semibold shadow-sm" : "font-medium text-muted-foreground"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
