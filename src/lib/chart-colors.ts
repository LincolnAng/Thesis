// A small categorical palette for identity coding (which product, which category)
// in the Summary charts. Kept muted to stay on-brand with the cocoa theme —
// deliberately distinct from the two semantic colors used elsewhere
// (--status-good green, --status-warning amber), which always mean money
// in / money out and must never double as a category color. Hues alternate
// warm/cool so adjacent donut segments and legend dots stay distinguishable
// at a glance, rather than several near-identical browns in a row. Re-stepped
// (same hues, same order) to pass the colorblind/contrast palette checks — the
// earlier, more muted set read as gray and put sage and plum too close to tell apart.
export const CHIP_COLORS = [
  "#7e5904", // ochre
  "#39a1bb", // teal
  "#a45859", // terracotta rose
  "#6068bc", // dusty blue
  "#879c54", // sage
  "#b477c5", // plum
] as const;

export function chipColor(index: number): string {
  return CHIP_COLORS[index % CHIP_COLORS.length];
}
