/**
 * A trend, inline in the row it describes. Suppliers was spending a 200px chart card per
 * supplier to say what this says in 60×20 — the full chart still exists on drill-down.
 */
export function SparklineCell({ points, tone = "neutral" }: { points: number[]; tone?: "good" | "warning" | "neutral" }) {
  const width = 60;
  const height = 20;
  if (points.length < 2) return <span className="text-xs text-muted-foreground">—</span>;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(height - ((p - min) / span) * height).toFixed(1)}`)
    .join(" ");

  const rising = points[points.length - 1] >= points[0];
  const color =
    tone === "good"
      ? "var(--status-good)"
      : tone === "warning"
        ? "var(--status-warning)"
        : rising
          ? "var(--status-good)"
          : "var(--status-critical)";

  return (
    <svg width={width} height={height} className="inline-block align-middle" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
