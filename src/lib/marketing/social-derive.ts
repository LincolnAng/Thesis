import type { SocialStatEntry } from "@/lib/store/types";

export const PLATFORMS = ["Facebook", "TikTok", "Instagram"] as const;

export interface PlatformSummary {
  platform: SocialStatEntry["platform"];
  latest: SocialStatEntry | null;
  followerChange: number | null;
}

export function summarizeByPlatform(stats: SocialStatEntry[]): PlatformSummary[] {
  return PLATFORMS.map((platform) => {
    const entries = stats
      .filter((s) => s.platform === platform)
      .sort((a, b) => new Date(b.weekOf).getTime() - new Date(a.weekOf).getTime());
    const latest = entries[0] ?? null;
    const previous = entries[1] ?? null;
    const followerChange = latest && previous ? latest.followers - previous.followers : null;
    return { platform, latest, followerChange };
  });
}

export type WeeklyFollowersPoint = { weekOf: string } & Partial<Record<(typeof PLATFORMS)[number], number>>;

/** Every logged week, oldest to newest, pivoted so each platform is its own column —
 * the full history `summarizeByPlatform` discards after comparing the latest two weeks. */
export function weeklyFollowersByPlatform(stats: SocialStatEntry[]): WeeklyFollowersPoint[] {
  const byWeek = new Map<string, WeeklyFollowersPoint>();
  for (const s of stats) {
    const point = byWeek.get(s.weekOf) ?? { weekOf: s.weekOf };
    point[s.platform] = s.followers;
    byWeek.set(s.weekOf, point);
  }
  return Array.from(byWeek.values()).sort((a, b) => new Date(a.weekOf).getTime() - new Date(b.weekOf).getTime());
}
