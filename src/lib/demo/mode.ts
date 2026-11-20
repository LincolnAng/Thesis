import type { Role } from "@/lib/store/types";

/**
 * The demo site: the same app, deployed a second time with NEXT_PUBLIC_DEMO_MODE=1 and no
 * Google or AI keys. Every /api call is answered inside the browser from made-up data
 * (lib/demo/fake-api), so nothing of the shop's can reach it, and each visitor's changes stay
 * on their own device until they press Reset.
 *
 * Read at build time, so on the real site this is `false` and none of the demo code runs.
 */
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "1";

export interface DemoProfile {
  id: string;
  name: string;
  role: Role;
  color: string;
}

/** The two people a visitor can switch between. */
export const DEMO_PROFILES: Record<"executive" | "employee", DemoProfile> = {
  executive: { id: "demo-exec", name: "Ana", role: "executive", color: "#8A5A7A" },
  employee: { id: "demo-emp", name: "Ben", role: "employee", color: "#5E7D4A" },
};

/** Where the demo keeps its copy of the business, its chat and its photos, in this browser. */
export const DEMO_KEYS = {
  db: "mkc-demo-db-v2",
  chat: "mkc-demo-chat-v1",
  photos: "mkc-demo-photos-v1",
} as const;
