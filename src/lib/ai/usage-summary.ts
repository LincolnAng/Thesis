/**
 * What AI cost, broken down — the AI costs tab in Settings.
 *
 * Every AI request is logged as it comes back (lib/sheets/ai-usage): who asked, which feature,
 * the model, its tokens and what it cost at list prices (lib/ai/spend). One message can take
 * several requests — BAi looking things up, then answering — and they share a requestId, so a
 * "prompt" here is everything one message cost. Pure, so it's tested (usage-summary.test.ts).
 */

export type AiFeature = "chat" | "assistant" | "advisor" | "sharpen" | "triage" | "season" | "other";

export const AI_FEATURE_LABELS: Record<AiFeature, string> = {
  chat: "BAi chat",
  assistant: "Logging from a message",
  advisor: "Business advice",
  sharpen: "Sharper questions",
  triage: "Choosing who answers",
  season: "Busy months",
  other: "Other",
};

export interface AiUseRow {
  id: string;
  /** When the response came back (ISO). */
  at: string;
  /** Requests made for the same message share this. */
  requestId: string;
  userId: string;
  userName: string;
  feature: AiFeature;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  searches: number;
  costUsd: number;
}

export interface AiCostGroup {
  key: string;
  label: string;
  usd: number;
  prompts: number;
  /** Of the month's logged cost, 0–1. */
  share: number;
}

export interface AiPrompt {
  requestId: string;
  at: string;
  userName: string;
  feature: AiFeature;
  model: string;
  inputTokens: number;
  outputTokens: number;
  searches: number;
  calls: number;
  usd: number;
}

export interface AiUseSummary {
  month: string;
  /** The month's whole spend, as the limit counts it — includes anything from before the log began. */
  totalUsd: number;
  /** What the per-request log accounts for. */
  loggedUsd: number;
  /** Spend from before the log began (or a write that didn't land): total less logged, never below 0. */
  unloggedUsd: number;
  prompts: number;
  calls: number;
  avgPerPromptUsd: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  searches: number;
  /** At this pace, the month's total — only for the current month, once a day has passed. */
  projectedUsd: number | null;
  byFeature: AiCostGroup[];
  byPerson: AiCostGroup[];
  byModel: AiCostGroup[];
  byDay: { day: string; usd: number; prompts: number }[];
  costliest: AiPrompt[];
  recent: AiPrompt[];
  /** When the first logged request this month was made, if any. */
  loggedSince: string | null;
}

const MANILA_MS = 8 * 3_600_000;
/** The Manila calendar day of an instant, "2026-10-29". */
export const manilaDay = (iso: string) => new Date(new Date(iso).getTime() + MANILA_MS).toISOString().slice(0, 10);

/** Readable model names: "claude-haiku-5-5" → "Haiku 5.5". */
export function modelLabel(model: string): string {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(model);
  if (!m) return model || "Unknown";
  return `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}${m[3] && m[3].length <= 2 ? `.${m[3]}` : ""}`;
}

function promptsOf(rows: AiUseRow[]): AiPrompt[] {
  const byId = new Map<string, AiPrompt>();
  for (const r of rows) {
    const key = r.requestId || r.id;
    const p = byId.get(key);
    if (!p) {
      byId.set(key, {
        requestId: key,
        at: r.at,
        userName: r.userName,
        feature: r.feature,
        model: r.model,
        inputTokens: r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens,
        outputTokens: r.outputTokens,
        searches: r.searches,
        calls: 1,
        usd: r.costUsd,
      });
      continue;
    }
    if (r.at < p.at) p.at = r.at;
    p.inputTokens += r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens;
    p.outputTokens += r.outputTokens;
    p.searches += r.searches;
    p.calls += 1;
    p.usd += r.costUsd;
  }
  return [...byId.values()];
}

function group(prompts: AiPrompt[], keyOf: (p: AiPrompt) => string, labelOf: (key: string) => string, total: number): AiCostGroup[] {
  const map = new Map<string, AiCostGroup>();
  for (const p of prompts) {
    const key = keyOf(p);
    const g = map.get(key) ?? { key, label: labelOf(key), usd: 0, prompts: 0, share: 0 };
    g.usd += p.usd;
    g.prompts += 1;
    map.set(key, g);
  }
  return [...map.values()].map((g) => ({ ...g, share: total > 0 ? g.usd / total : 0 })).sort((a, b) => b.usd - a.usd);
}

/**
 * The month's AI costs. `rows` may hold other months (they're left out); `recordedUsd` is the
 * month's running total that the limit uses, so spend from before the log began still counts.
 */
export function summarizeAiUse(rows: AiUseRow[], month: string, recordedUsd: number, now = new Date()): AiUseSummary {
  const inMonth = rows.filter((r) => manilaDay(r.at).startsWith(month));
  const prompts = promptsOf(inMonth);
  const loggedUsd = inMonth.reduce((n, r) => n + r.costUsd, 0);
  const totalUsd = Math.max(recordedUsd, loggedUsd);

  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = manilaDay(now.toISOString());
  const current = today.startsWith(month);
  const lastDay = current ? Number(today.slice(8, 10)) : daysInMonth;
  const byDay = Array.from({ length: lastDay }, (_, i) => ({ day: `${month}-${String(i + 1).padStart(2, "0")}`, usd: 0, prompts: 0 }));
  for (const p of prompts) {
    const d = byDay[Number(manilaDay(p.at).slice(8, 10)) - 1];
    if (!d) continue;
    d.usd += p.usd;
    d.prompts += 1;
  }

  const sum = (f: (r: AiUseRow) => number) => inMonth.reduce((n, r) => n + f(r), 0);
  return {
    month,
    totalUsd,
    loggedUsd,
    unloggedUsd: Math.max(0, totalUsd - loggedUsd),
    prompts: prompts.length,
    calls: inMonth.length,
    avgPerPromptUsd: prompts.length > 0 ? loggedUsd / prompts.length : 0,
    tokens: { input: sum((r) => r.inputTokens), output: sum((r) => r.outputTokens), cacheRead: sum((r) => r.cacheReadTokens), cacheWrite: sum((r) => r.cacheWriteTokens) },
    searches: sum((r) => r.searches),
    projectedUsd: current && lastDay > 1 ? (totalUsd / lastDay) * daysInMonth : null,
    byFeature: group(prompts, (p) => p.feature, (k) => AI_FEATURE_LABELS[k as AiFeature] ?? k, loggedUsd),
    byPerson: group(prompts, (p) => p.userName || "Unknown", (k) => k, loggedUsd),
    byModel: group(prompts, (p) => modelLabel(p.model), (k) => k, loggedUsd),
    byDay,
    costliest: [...prompts].sort((a, b) => b.usd - a.usd).slice(0, 5),
    recent: [...prompts].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25),
    loggedSince: inMonth.length > 0 ? inMonth.reduce((a, r) => (r.at < a ? r.at : a), inMonth[0].at) : null,
  };
}
