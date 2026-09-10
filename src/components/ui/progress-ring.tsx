import { statusColor, type StatusKind } from "@/components/ui/status-symbol";

/**
 * A shape instead of a figure. "₱0 of ₱6,500" is a sentence you have to read and divide;
 * a ring you have already understood by the time you finish looking at it.
 */
export function ProgressRing({
  value,
  max,
  size = 56,
  stroke = 6,
  kind,
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  /** Omit to colour by how full the ring is: green, then amber, then red. */
  kind?: StatusKind;
  children?: React.ReactNode;
}) {
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const autoKind: StatusKind = pct >= 1 ? "critical" : pct >= 0.8 ? "watch" : "good";
  const color = statusColor(kind ?? autoKind);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
        />
      </svg>
      {children && <span className="absolute inset-0 flex items-center justify-center">{children}</span>}
    </span>
  );
}
