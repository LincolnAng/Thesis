"use client";

import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingNumberInput } from "@/components/ui/setting-number-input";
import { formatPeso } from "@/lib/format";

/**
 * The monthly AI limit — a hard stop. Once this month's AI spend reaches it, BAi and every
 * other AI feature pause until next month or until it's raised (lib/ai/spend). Blank means
 * no limit.
 */
export function AiLimitCard() {
  const [limit, setLimit] = useState<number | null>(null);
  const [spent, setSpent] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = () =>
    fetch("/api/settings")
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) return;
        setLimit(json.monthlyLimitPhp ?? null);
        setSpent(json.spentThisMonthPhp ?? 0);
      })
      .catch(() => {});
  useEffect(() => {
    void load();
  }, []);

  async function save(next: number) {
    setMessage(null);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthlyLimitPhp: next > 0 ? next : null }),
    }).then((r) => r.json()).catch(() => null);
    setMessage(res?.success ? "Saved." : "That didn't save — try again.");
    if (res?.success) void load();
  }

  const reached = limit != null && spent != null && spent >= limit;
  const pct = limit && spent != null ? Math.min(100, (spent / limit) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4" /> Monthly AI limit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          A hard stop: once this month&apos;s AI spending reaches it, BAi pauses until next month or until you raise it. Leave blank for no limit.
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm">₱</span>
          <SettingNumberInput className="h-9 w-32" value={limit ?? 0} placeholder="No limit" onCommit={(n) => void save(n)} />
          <span className="text-sm text-muted-foreground">a month</span>
        </div>
        {spent != null && (
          <div className="space-y-1">
            <p className={`text-sm ${reached ? "font-semibold text-danger" : ""}`}>
              Used this month: {formatPeso(spent)}
              {limit ? ` of ${formatPeso(limit)}` : ""}
              {reached ? " — limit reached, BAi is paused" : ""}
            </p>
            {limit ? (
              <div className="h-2 overflow-hidden rounded-full bg-track">
                <div className={reached ? "h-full bg-danger" : "h-full bg-cacao"} style={{ width: `${pct}%` }} />
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">Worked out from Anthropic&apos;s list prices at about ₱58 to the dollar.</p>
          </div>
        )}
        {message && <p className="text-xs text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}
