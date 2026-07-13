export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  segments,
  size = 96,
  thickness = 14,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const stops: string[] = [];
  let cursor = 0;

  if (total <= 0) {
    stops.push("var(--muted) 0% 100%");
  } else {
    for (const seg of segments) {
      const pct = (seg.value / total) * 100;
      if (pct <= 0) continue;
      const start = cursor;
      const end = cursor + pct;
      stops.push(`${seg.color} ${start}% ${end}%`);
      cursor = end;
    }
  }

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="h-full w-full rounded-full" style={{ background: `conic-gradient(${stops.join(", ")})` }} />
      <div className="absolute rounded-full bg-card" style={{ inset: `${thickness}px` }} />
    </div>
  );
}
