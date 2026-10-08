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
 */
export function CarouselNav({
  label,
  onPrev,
  onNext,
  atStart = false,
  atEnd = false,
  wrap = false,
  labelWidth = "min-w-[140px]",
  prevLabel = "Previous",
  nextLabel = "Next",
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  atStart?: boolean;
  atEnd?: boolean;
  wrap?: boolean;
  labelWidth?: string;
  prevLabel?: string;
  nextLabel?: string;
}) {
  return (
    <div className="flex w-fit items-center rounded-full border border-line/15 bg-white">
      <button
        type="button"
        aria-label={prevLabel}
        disabled={!wrap && atStart}
        onClick={onPrev}
        className="flex h-9 w-9 items-center justify-center rounded-l-full text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className={`${labelWidth} px-1 text-center text-[13px] font-semibold`}>{label}</span>
      <button
        type="button"
        aria-label={nextLabel}
        disabled={!wrap && atEnd}
        onClick={onNext}
        className="flex h-9 w-9 items-center justify-center rounded-r-full text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-30"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
