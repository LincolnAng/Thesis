"use client";

import { RotateCcw } from "lucide-react";
import { Segmented } from "@/components/ui/kit";
import { useCurrentUser } from "@/lib/auth/current-user";
import { DEMO_PROFILES } from "@/lib/demo/mode";
import { resetDemo } from "@/lib/demo/fake-api";

const USER_KEY = "mang-kikos-cocoa-current-user-v2";
const PRIVATE_KEYS = ["mang-kikos-cocoa-state-v6", "mang-kikos-cocoa-chat-paint-cache-v1"];

function viewAs(role: "executive" | "employee") {
  const p = DEMO_PROFILES[role];
  try {
    // Exactly what signing in does: the other person's copy goes, then a clean reload.
    for (const key of PRIVATE_KEYS) window.localStorage.removeItem(key);
    window.localStorage.setItem(USER_KEY, JSON.stringify({ id: p.id, name: p.name, role: p.role }));
  } catch {
    // private browsing: the reload still lands on the default view
  }
  window.location.reload();
}

/**
 * The strip across the top of the demo site: says it's a demo, flips between the Executive
 * and Employee views, and starts the demo over. Only rendered when IS_DEMO.
 */
export function DemoBar() {
  const me = useCurrentUser();
  const role = me?.role === "employee" ? "employee" : "executive";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line/10 bg-cacao/[0.06] px-4 py-2">
      <span className="rounded-full bg-cacao px-2.5 py-0.5 text-[11.5px] font-bold uppercase tracking-wide text-ivory">Demo</span>
      <span className="hidden text-[12.5px] text-muted-foreground min-[700px]:inline">
        Sample data only. Your changes stay in this browser.
      </span>
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden text-[12.5px] font-medium text-muted-foreground min-[480px]:inline">Viewing as</span>
        <Segmented
          label="View the site as"
          value={role}
          onChange={(v) => v !== role && viewAs(v)}
          options={[
            { value: "executive", label: "Executive", title: `${DEMO_PROFILES.executive.name}, the owner: sees everything` },
            { value: "employee", label: "Employee", title: `${DEMO_PROFILES.employee.name}, staff: no costs, expenses or payroll` },
          ]}
        />
        <button
          type="button"
          onClick={() => {
            if (!window.confirm("Start the demo over? Anything you added or changed here goes back to the sample data.")) return;
            resetDemo();
            window.location.reload();
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line/15 bg-card px-3 text-[13px] font-medium text-muted-foreground transition duration-100 hover:text-foreground active:scale-[0.96]"
          title="Put the sample data back"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden min-[480px]:inline">Reset</span>
        </button>
      </div>
    </div>
  );
}
