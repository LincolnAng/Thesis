"use client";

export type ViewMode = "simple" | "advanced";

/**
 * Every page now shows its one full view, so this always answers "advanced" — the client asked
 * for Simple/Advanced to go everywhere, with Home's own Advanced button the only switch left.
 * The pages' Simple branches are unreachable and can be removed as each page is reworked.
 */
export function useViewMode(): [ViewMode, (mode: ViewMode) => void] {
  return ["advanced", () => {}];
}
