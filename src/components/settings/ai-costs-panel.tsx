"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AI_FEATURE_LABELS, modelLabel, type AiCostGroup, type AiPrompt, type AiUseSummary } from "@/lib/ai/usage-summary";

/**
 * The AI costs tab (Executives): what BAi and the other AI features cost — this month and before,
 * by feature, by person, by model and by day, with the costliest and latest prompts. Every figure
 * is worked out from the tokens each request used, at Anthropic's list prices (lib/ai/spend).
 */

interface Payload {
  success: boolean;
  phpPerUsd: number;
  currentMonth: string;
  summary: AiUseSummary;
  months: { month: string; usd: number }[];
}

/** Pesos, with centavos — and a little more when it's under a peso, as most prompts are. */
function peso(php: number): string {
  if (php > 0 && php < 1) return `₱${php.toFixed(php < 0.1 ? 3 : 2)}`;
  return `₱${php.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
const monthName = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-PH", { month: "long", year: "numeric" });
};
const shiftMonth = (ym: string, by: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function AiCostsPanel() {
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/ai-usage${month ? `?month=${month}` : ""}`)
      .then((r) => r.json())
      .then((j: Payload) => {
        if (!live) return;
        if (!j?.success) return setError(true);
        setError(false);
        setData(j);
        if (!month) setMonth(j.summary.month);
      })
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [month]);

  if (error && !data) return <p className="text-sm text-danger">The AI costs couldn&apos;t be loaded. Check the internet and open this tab again.</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading the AI costs…</p>;

  const s = data.summary;
  const php = (usd: number) => usd * data.phpPerUsd;
  const isCurrent = s.month === data.currentMonth;
  const maxDay = Math.max(...s.byDay.map((d) => d.usd), 0);
  const maxMonth = Math.max(...data.months.map((m) => m.usd), 0);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <Receipt className="h-4 w-4" /> AI costs
            </span>
            <span className="flex items-center gap-1 text-sm font-semibold">
              <button type="button" onClick={() => setMonth(shiftMonth(s.month, -1))} aria-label="Month before" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-secondary">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-36 text-center">{monthName(s.month)}</span>
              <button
                type="button"
                onClick={() => setMonth(shiftMonth(s.month, 1))}
                disabled={isCurrent}
                aria-label="Month after"
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-secondary disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Spent" value={peso(php(s.totalUsd))} note={`US$${s.totalUsd.toFixed(2)}`} />
            <Stat label="Prompts" value={s.prompts.toLocaleString("en-PH")} note={s.calls > s.prompts ? `${s.calls} requests to the AI` : "messages answered"} />
            <Stat label="Average per prompt" value={s.prompts ? peso(php(s.avgPerPromptUsd)) : "—"} note={s.prompts ? `${tokens((s.tokens.input + s.tokens.cacheRead + s.tokens.cacheWrite) / s.prompts)} in · ${tokens(s.tokens.output / s.prompts)} out` : "no prompts yet"} />
            <Stat
              label={isCurrent ? "At this pace, the month" : "Web searches"}
              value={isCurrent ? (s.projectedUsd != null ? peso(php(s.projectedUsd)) : "—") : String(s.searches)}
              note={isCurrent ? "if every day is like the days so far" : "made by BAi and advice"}
            />
          </div>

          <div>
            <h4 className="mb-2 text-[13px] font-semibold">Each day</h4>
            <div className="flex h-28 items-end gap-[3px] rounded-lg bg-secondary/40 px-2 pt-2" role="img" aria-label="AI cost each day">
              {s.byDay.map((d) => (
                <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end" title={`${d.day.slice(8)} ${monthName(s.month)}: ${peso(php(d.usd))} · ${d.prompts} prompts`}>
                  <div className="w-full rounded-t-sm bg-cacao/80 group-hover:bg-cacao" style={{ height: `${maxDay > 0 ? Math.max(d.usd > 0 ? 3 : 0, (d.usd / maxDay) * 100) : 0}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between px-2 text-[11px] text-muted-foreground">
              <span>1</span>
              <span>{s.byDay.length}</span>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <Breakdown title="By feature" groups={s.byFeature} php={php} />
            <Breakdown title="By person" groups={s.byPerson} php={php} />
            <Breakdown title="By model" groups={s.byModel} php={php} />
          </div>

          {s.unloggedUsd * data.phpPerUsd >= 0.01 && (
            <p className="rounded-lg bg-secondary/60 px-3 py-2 text-[12.5px] text-muted-foreground">
              {`${peso(php(s.unloggedUsd))} of this month's spend was before the breakdown began${s.loggedSince ? ` (${when(s.loggedSince)})` : ""}, so it's in the total but not in the lists.`}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prompts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {s.prompts === 0 ? (
            <p className="text-sm text-muted-foreground">No prompts logged for {monthName(s.month)}.</p>
          ) : (
            <>
              <PromptTable title="Costliest" prompts={s.costliest} php={php} />
              <PromptTable title="Latest" prompts={s.recent} php={php} />
            </>
          )}
        </CardContent>
      </Card>

      {data.months.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Every month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.months.map((m) => (
              <button key={m.month} type="button" onClick={() => setMonth(m.month)} className={`grid w-full grid-cols-[120px_1fr_90px] items-center gap-3 rounded-lg px-1 py-1 text-left text-sm hover:bg-secondary ${m.month === s.month ? "font-semibold" : ""}`}>
                <span>{monthName(m.month)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-track">
                  <span className="block h-full rounded-full bg-cacao" style={{ width: `${maxMonth > 0 ? (m.usd / maxMonth) * 100 : 0}%` }} />
                </span>
                <span className="text-right tabular-nums">{peso(php(m.usd))}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        {`Worked out from the tokens each request used, at Anthropic's list prices and about ₱${data.phpPerUsd} to the dollar, so it's an estimate. The exact bill is in the Anthropic Console under Usage and Cost. Talking to BAi by voice is free: the phone or browser turns speech into text.`}
      </p>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-line/15 p-3">
      <div className="text-[12px] font-semibold text-muted-foreground">{label}</div>
      <div className="font-display text-[20px] font-bold tabular-nums">{value}</div>
      <div className="text-[11.5px] text-muted-foreground">{note}</div>
    </div>
  );
}

function Breakdown({ title, groups, php }: { title: string; groups: AiCostGroup[]; php: (usd: number) => number }) {
  return (
    <div>
      <h4 className="mb-2 text-[13px] font-semibold">{title}</h4>
      {groups.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nothing yet.</p>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.key} className="text-[13px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate">{g.label}</span>
                <span className="shrink-0 font-semibold tabular-nums">{peso(php(g.usd))}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-track">
                <div className="h-full rounded-full bg-cacao" style={{ width: `${g.share * 100}%` }} />
              </div>
              <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                {g.prompts} {g.prompts === 1 ? "prompt" : "prompts"} · {Math.round(g.share * 100)}% · {peso(php(g.usd / g.prompts))} each
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PromptTable({ title, prompts, php }: { title: string; prompts: AiPrompt[]; php: (usd: number) => number }) {
  return (
    <div>
      <h4 className="mb-2 text-[13px] font-semibold">{title}</h4>
      <div className="overflow-x-auto rounded-xl border border-line/15">
        <table className="w-full min-w-[560px] border-collapse text-[13px]">
          <thead className="bg-secondary text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <tr>
              {["When", "Who", "For", "Model", "Tokens in / out", "Cost"].map((h) => (
                <th key={h} className={`px-2.5 py-2 ${h === "Cost" || h.startsWith("Tokens") ? "text-right" : "text-left"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prompts.map((p) => (
              <tr key={p.requestId} className="border-t border-line/10">
                <td className="whitespace-nowrap px-2.5 py-2">{when(p.at)}</td>
                <td className="px-2.5 py-2">{p.userName || "—"}</td>
                <td className="px-2.5 py-2">
                  {AI_FEATURE_LABELS[p.feature] ?? p.feature}
                  {p.searches > 0 && <span className="ml-1 text-muted-foreground">· {p.searches} web {p.searches === 1 ? "search" : "searches"}</span>}
                </td>
                <td className="px-2.5 py-2">{modelLabel(p.model)}</td>
                <td className="px-2.5 py-2 text-right tabular-nums">
                  {tokens(p.inputTokens)} / {tokens(p.outputTokens)}
                </td>
                <td className="px-2.5 py-2 text-right font-semibold tabular-nums">{peso(php(p.usd))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
