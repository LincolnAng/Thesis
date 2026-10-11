import { useId } from "react";
import { cn } from "@/lib/utils";

const PIECES = [0, 1, 2].flatMap((row) => [0, 1].map((col) => ({ x: 4 + col * 12, y: 4 + row * 11 })));

/**
 * The shop's mark: a 2×3 chocolate bar with a bite out of the top corner. Size it with
 * height and width classes in a 4:5 ratio (e.g. `h-10 w-8`).
 */
export function ChocolateBarLogo({ className }: { className?: string }) {
  // Each logo on the page needs its own mask id, or they would all share the first one's bite.
  const biteId = `chocolate-bite-${useId()}`;
  return (
    <svg viewBox="0 0 32 40" className={cn("shrink-0", className)} role="img" aria-label="Mang Kiko's Cocoa">
      <defs>
        <mask id={biteId}>
          <rect width="32" height="40" fill="white" />
          <circle cx="31" cy="3" r="7" fill="black" />
          <circle cx="22" cy="-1" r="5" fill="black" />
        </mask>
      </defs>
      <g mask={`url(#${biteId})`}>
        <rect x="1" y="1" width="30" height="38" rx="4" className="fill-cacao" />
        {PIECES.map(({ x, y }) => (
          <rect key={`edge-${x}-${y}`} x={x} y={y} width="12" height="11" rx="2" className="fill-sand" opacity="0.35" />
        ))}
        {PIECES.map(({ x, y }) => (
          <rect key={`top-${x}-${y}`} x={x + 1.5} y={y + 1.5} width="9" height="8" rx="1.5" className="fill-cacao" />
        ))}
      </g>
    </svg>
  );
}
