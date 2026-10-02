"use client";

/**
 * One fact as a small tile: the thing's name, and its number. Nothing else.
 *
 * Everything else on this page had been a table — six aligned columns you read across
 * before the number meant anything — while the one section built as tiles was the one that
 * could be taken in at a glance. So the tiles won, and then the explanations that had crept
 * onto them went too: a tile that needs a sentence underneath isn't doing its job.
 *
 * The working behind each number is kept on the tile's `title`, so hovering still answers
 * "why that figure?" without any of it being on screen by default.
 *
 * Sizing is container-relative rather than fixed. The tiles sit in one row whatever the
 * count, so adding products makes each one narrower — and `cqi` (1% of the tile's own
 * width) lets the text shrink with it instead of wrapping into a ragged block.
 */

export interface StatCardProps {
  /** The thing this tile is about — a product or material name. */
  label: string;
  /** The number, large. */
  value: string;
  /** Smaller text after the number, usually a unit. */
  unit?: string;
  /** A short warning, shown only when something is wrong. Two or three words, never a sentence. */
  flag?: string;
  /** The working behind the number. Reachable on hover; never rendered. */
  detail?: string;
  tone?: "bad" | "muted";
  onClick?: () => void;
}

export function StatCard({ label, value, unit, flag, detail, tone = "muted", onClick }: StatCardProps) {
  const bad = tone === "bad";
  const body = (
    <>
      <div
        className="break-words text-muted-foreground"
        style={{ fontSize: "clamp(9px, 11cqi, 13px)", lineHeight: 1.25 }}
      >
        {label}
      </div>
      <div
        className={`mt-0.5 font-display font-semibold ${bad ? "text-danger" : "text-foreground"}`}
        style={{ fontSize: "clamp(13px, 19cqi, 20px)", lineHeight: 1.15 }}
      >
        {value}
        {unit && (
          <span className="ml-1 font-normal text-muted-foreground" style={{ fontSize: "clamp(8px, 10cqi, 13px)" }}>
            {unit}
          </span>
        )}
      </div>
      {flag && (
        <div className="font-semibold text-danger" style={{ fontSize: "clamp(8px, 9cqi, 11px)", lineHeight: 1.25 }}>
          {flag}
        </div>
      )}
    </>
  );

  const className = `rounded-xl border px-2.5 py-2.5 text-left [container-type:inline-size] ${
    bad ? "border-danger/35 bg-danger/[0.03]" : "border-line/15"
  } ${onClick ? "transition hover:border-cacao/40 hover:bg-secondary/40" : ""}`;

  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} w-full`} title={detail ?? "Click to edit"}>
      {body}
    </button>
  ) : (
    <div className={className} title={detail}>
      {body}
    </div>
  );
}

/**
 * A fixed number of columns rather than one column per tile, so a tile is the same size
 * wherever it appears — three products and six materials used to divide the same width
 * between them and come out at 307px and 148px, which read as two different kinds of thing.
 * Now every section shares one grid and the columns line up down the page.
 *
 * Six across fits the counts this shop has; beyond that they wrap to a second row at the
 * same size instead of shrinking away.
 */
export function StatCardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 min-[700px]:grid-cols-4 min-[1100px]:grid-cols-6">{children}</div>
  );
}
