// A small categorical palette for identity coding (which product, which category)
// in the Summary charts. Kept muted to stay on-brand with the cocoa theme —
// deliberately distinct from the two semantic colors used elsewhere
// (--status-good green, --status-warning amber), which always mean money
// in / money out and must never double as a category color. Hues alternate
// warm/cool so adjacent donut segments and legend dots stay distinguishable
// at a glance, rather than several near-identical browns in a row.
export const CHIP_COLORS = [
  "#c9a06e", // tan / gold
  "#7fa3ad", // dusty teal
  "#b5654a", // terracotta
  "#6b7fa3", // dusty blue
  "#86946f", // sage
  "#9b7fa3", // muted plum
] as const;

export function chipColor(index: number): string {
  return CHIP_COLORS[index % CHIP_COLORS.length];
}
