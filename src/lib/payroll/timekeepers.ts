/**
 * Who keeps time: the profiles an Executive names (Ruchel, Aunty Sandy) that time staff in and
 * out — anyone's, including staff with no profile of their own, like Kuya Dadoy. Stored as a
 * business setting, a comma-separated list of profile ids. Executives keep time too.
 */
export const TIMEKEEPERS_KEY = "timekeepers";

export function timekeeperIds(settings: Record<string, string> | { key: string; value: string }[]): string[] {
  const raw = Array.isArray(settings) ? (settings.find((s) => s.key === TIMEKEEPERS_KEY)?.value ?? "") : (settings[TIMEKEEPERS_KEY] ?? "");
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function isTimekeeper(settings: Record<string, string> | { key: string; value: string }[], userId: string | undefined | null): boolean {
  return Boolean(userId) && timekeeperIds(settings).includes(String(userId));
}
