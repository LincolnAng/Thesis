import { DEMO_PROFILES, IS_DEMO } from "./mode";
import { installDemoApi } from "./fake-api";

/**
 * Imported for its side effect by lib/auth/current-user and lib/store/store, so it runs before
 * either: in demo mode, /api is answered in the browser and someone is already signed in, so the
 * "Who's using this?" screen never shows. On the real site IS_DEMO is false and this does nothing.
 */
const USER_KEY = "mang-kikos-cocoa-current-user-v2";

if (IS_DEMO && typeof window !== "undefined") {
  installDemoApi();
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    const id = raw ? (JSON.parse(raw) as { id?: string }).id : undefined;
    if (id !== DEMO_PROFILES.executive.id && id !== DEMO_PROFILES.employee.id) {
      const p = DEMO_PROFILES.executive;
      window.localStorage.setItem(USER_KEY, JSON.stringify({ id: p.id, name: p.name, role: p.role }));
    }
  } catch {
    // No storage: the profile picker shows instead, and still works.
  }
}

export {};
