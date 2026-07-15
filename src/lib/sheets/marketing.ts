import { createSheetCollection } from "./collection";
import type { SocialStatEntry } from "@/lib/store/types";

const HEADER = ["id", "platform", "weekOf", "followers", "reach", "engagements", "deletedAt"];

function toRow(s: SocialStatEntry): string[] {
  return [s.id, s.platform, s.weekOf, String(s.followers), String(s.reach), String(s.engagements), ""];
}

function fromRow(row: string[]): SocialStatEntry | null {
  const [id, platform, weekOf, followers, reach, engagements] = row;
  if (!id) return null;
  return {
    id,
    platform: platform as SocialStatEntry["platform"],
    weekOf,
    followers: Number(followers) || 0,
    reach: Number(reach) || 0,
    engagements: Number(engagements) || 0,
  };
}

export const socialStatsCollection = createSheetCollection<SocialStatEntry>({
  sheetName: "Marketing",
  header: HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow,
  fromRow,
});
