/**
 * Profile tile colours, saved on the profile so a person looks the same on every device.
 * Warm, brand-adjacent, and dark enough for white initials on top.
 */
export const PROFILE_COLORS = ["#7B4B2A", "#A0522D", "#5E7D4A", "#8A5A7A", "#3F6E8C", "#B3742A", "#6B5B95", "#9C4A3C"];

export function profileColor(color: string | undefined, index: number): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : PROFILE_COLORS[index % PROFILE_COLORS.length];
}
