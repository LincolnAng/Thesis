"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * One way to step through a list, used everywhere something steps through a list.
 *
 * Money had a pill with an arrow either side of the label; the production calendar had a row
 * of month chips; Inventory had arrows plus dots. Three controls doing the same job in three
 * shapes, so nothing learned on one screen carried to the next. Money's won — the label sits
 * between its arrows, which is what makes it read as one control rather than two buttons with
 * a caption.
 *
 * `wrap` is for a loop with no ends, like Inventory's three sections. Without it the arrows
 * disable at the edges, which is right for months: there is no month before the first one.
 *
 * A loop has no edge to stop at, so `position` shows where in it you are: a dot per stop with the
 * current one filled, or "3 / 20" once there are too many to dot.
 */
export function CarouselNav({
  label,
  onPrev,
  onNext,
  atStart = false,
  atEnd = false,
  wrap = false,
  labelWidth = "w-[150px]",
  size = "default",
  prevLabel = "Previous",
  nextLabel = "Next",
  position,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  atStart?: boolean;
  atEnd?: boolean;
  wrap?: boolean;
  labelWidth?: string;
  /** "large" for a control that steps a whole page, where the arrows are the main target. */
  size?: "default" | "large";
  prevLabel?: string;
  nextLabel?: string;
  /** Where in the cycle the label is (0-based), out of how many stops. */
  position?: { index: number; count: number };
}) {
  const big = size === "large";
  const box = big ? "h-12 w-12" : "h-9 w-9";
  const glyph = big ? "h-6 w-6" : "h-4 w-4";

  return (
    <div className="flex w-fit items-center rounded-full border border-line/15 bg-card">
      <button
        type="button"
        aria-label={prevLabel}
        disabled={!wrap && atStart}
        onClick={onPrev}
        className={`flex ${box} items-center justify-center rounded-l-full text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-30`}
      >
        <ChevronLeft className={glyph} />
      </button>
      <span className={`${labelWidth} flex min-w-0 flex-col items-center justify-center px-1`}>
        <span className={`max-w-full truncate text-center font-semibold leading-4 ${big ? "text-[15px]" : "text-[13px]"}`}>{label}</span>
        {position && position.count > 1 && (
          <span className="mt-1 flex items-center gap-1" role="img" aria-label={`${position.index + 1} of ${position.count}`}>
            {position.count <= 12 ? (
              Array.from({ length: position.count }, (_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-[width,background-color] duration-200 ease-out ${i === position.index ? "w-3 bg-cacao" : "w-1.5 bg-line/30"}`} />
              ))
            ) : (
              <span className="text-[10.5px] font-semibold leading-none tabular-nums text-muted-foreground">
                {position.index + 1} / {position.count}
              </span>
            )}
          </span>
        )}
      </span>
      <button
        type="button"
        aria-label={nextLabel}
        disabled={!wrap && atEnd}
        onClick={onNext}
        className={`flex ${box} items-center justify-center rounded-r-full text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-30`}
      >
        <ChevronRight className={glyph} />
      </button>
    </div>
  );
}
