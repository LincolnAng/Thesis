"use client";

import type { ForecastReliability } from "@/lib/summary/forecast";
import { EMPTY, confidenceColor } from "@/lib/summary/scale-colors";

/**
 * How much the forecast can be leaned on, as a small donut.
 *
 * A forecast fitted on one month and one fitted on two years look identical on screen — both
 * are just a number — and that is the dangerous part: nothing tells the owner which one to plan
 * around. A ring filled to a fifth reads as "barely anything" at a glance, where five dashes
 * needed counting first.
 *
 * The colour comes from the fill COUNT, not from the band name, so a full ring always looks the
 * same wherever it appears, and a month's own strength can be drawn honestly even when it
 * differs from its product's overall band.
 */

const LABEL: Record<string, string> = {
  none: "No forecast yet",
  low: "Rough guess",
  medium: "Fair estimate",
  high: "Solid estimate",
};

const STEPS = 5;

export function ConfidenceDonut({
  reliability,
  showLabel = false,
  size = 18,
  override,
}: {
  reliability: ForecastReliability;
  showLabel?: boolean;
  size?: number;
  /**
   * One month's own strength, rather than the product's. A December eighteen months out is
   * shakier than next week whatever the product's overall record looks like, so the month-by-
   * month table passes its own figures here and keeps only the wording from the product.
   */
  override?: { bars: number; range: { low: number; high: number } | null; note?: string };
}) {
  const { level, reason } = reliability;
  const filled = override ? override.bars : reliability.bars;
  const range = override ? override.range : reliability.range;
  const title = [
    `${LABEL[level]} (${filled} of ${STEPS})`,
    override?.note ?? reason,
    range
      ? `${override ? "This month" : "Next month"} is likely between ${range.low} and ${range.high} jars.`
      : "",
  ]
    .filter(Boolean)
    .join(" — ");

  const colour = confidenceColor(filled);
  // Geometry: a stroked circle whose dash pattern is the filled fraction. Drawn from 12 o'clock
  // rather than 3, because a ring that starts anywhere else reads as a slice of a pie chart.
  const stroke = Math.max(3, Math.round(size / 5));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.max(0, Math.min(1, filled / STEPS));

  return (
    <span className="inline-flex items-center gap-2" title={title}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={EMPTY} strokeWidth={stroke} />
        {fraction > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={colour}
            strokeWidth={stroke}
            strokeLinecap="butt"
            strokeDasharray={`${circumference * fraction} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
        {/* Faint spokes at each fifth, so the ring reads as five steps rather than a continuous
            dial. Without them a four-fifths ring and a full one are hard to tell apart at 18px. */}
        {Array.from({ length: STEPS }, (_, i) => {
          const angle = (i / STEPS) * 2 * Math.PI - Math.PI / 2;
          const inner = radius - stroke / 2;
          const outer = radius + stroke / 2;
          const cx = size / 2;
          const cy = size / 2;
          return (
            <line
              key={i}
              x1={cx + Math.cos(angle) * inner}
              y1={cy + Math.sin(angle) * inner}
              x2={cx + Math.cos(angle) * outer}
              y2={cy + Math.sin(angle) * outer}
              stroke="#FFFFFF"
              strokeOpacity={0.55}
              strokeWidth={1}
            />
          );
        })}
      </svg>
      <span className="sr-only">{title}</span>
      {showLabel && (
        <span className="text-[11px] font-semibold" style={{ color: filled > 0 ? colour : undefined }}>
          {LABEL[level]}
        </span>
      )}
    </span>
  );
}
