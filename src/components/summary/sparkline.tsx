import { cn } from "@/lib/utils";

export interface SparklinePoint {
  label: string;
  value: number;
}

export function Sparkline({ points, height = 36 }: { points: SparklinePoint[]; height?: number }) {
  const max = Math.max(...points.map((p) => p.value), 1);

  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {points.map((p, i) => {
        const isLast = i === points.length - 1;
        const h = Math.max(3, (p.value / max) * height);
        return (
          <div
            key={i}
            title={`${p.label}: ${p.value.toLocaleString("en-PH")}`}
            className={cn("w-2 rounded-sm", isLast ? "bg-primary" : "bg-muted-foreground/30")}
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
}
