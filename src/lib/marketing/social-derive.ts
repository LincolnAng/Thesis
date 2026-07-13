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
