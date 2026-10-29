import { test } from "node:test";
import assert from "node:assert/strict";
import { modelLabel, summarizeAiUse, type AiUseRow } from "@/lib/ai/usage-summary";

const row = (over: Partial<AiUseRow>): AiUseRow => ({
  id: Math.random().toString(36).slice(2),
  at: "2026-10-05T02:00:00Z",
  requestId: "r1",
  userId: "u1",
  userName: "Sandy",
  feature: "chat",
  model: "claude-haiku-5-5",
  inputTokens: 1000,
  outputTokens: 200,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  searches: 0,
  costUsd: 0.01,
  ...over,
});

test("one message's requests count as one prompt, and spend before the log began is kept apart", () => {
  const rows = [
    row({ requestId: "a", costUsd: 0.02 }),
    row({ requestId: "a", costUsd: 0.03, searches: 1 }),
    row({ requestId: "b", userName: "Ruchel", feature: "assistant", costUsd: 0.05, at: "2026-10-06T03:00:00Z" }),
    row({ requestId: "c", at: "2026-09-30T03:00:00Z", costUsd: 9 }), // September
  ];
  const s = summarizeAiUse(rows, "2026-10", 0.25, new Date("2026-10-10T04:00:00Z"));
  assert.equal(s.prompts, 2);
  assert.equal(s.calls, 3);
  assert.ok(Math.abs(s.loggedUsd - 0.1) < 1e-9);
  assert.ok(Math.abs(s.unloggedUsd - 0.15) < 1e-9);
  assert.ok(Math.abs(s.avgPerPromptUsd - 0.05) < 1e-9);
  assert.equal(s.searches, 1);
  assert.equal(s.byDay.length, 10); // up to today
  assert.equal(s.byDay[4].prompts, 1);
  assert.deepEqual(s.byPerson.map((g) => g.key).sort(), ["Ruchel", "Sandy"]);
  assert.ok(Math.abs(s.projectedUsd! - (0.25 / 10) * 31) < 1e-9);
  assert.equal(s.costliest[0].usd, 0.05);
});

test("a past month has every day and no projection", () => {
  const s = summarizeAiUse([], "2026-09", 0, new Date("2026-10-10T04:00:00Z"));
  assert.equal(s.byDay.length, 30);
  assert.equal(s.projectedUsd, null);
  assert.equal(s.prompts, 0);
});

test("model names read plainly", () => {
  assert.equal(modelLabel("claude-haiku-5-5"), "Haiku 5.5");
  assert.equal(modelLabel("claude-opus-5-5"), "Opus 5.5");
  assert.equal(modelLabel("claude-sonnet-5"), "Sonnet 5");
  assert.equal(modelLabel("claude-sonnet-4-20250514"), "Sonnet 4");
});
