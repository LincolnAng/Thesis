import { test } from "node:test";
import assert from "node:assert/strict";
import { grokModelFor, grokTools, providerOf, readResponse } from "./grok.ts";
import { costUsd } from "./spend.ts";
import { modelLabel } from "./usage-summary.ts";

test("the saved key picks the provider", () => {
  assert.equal(providerOf("xai-abc123"), "grok");
  assert.equal(providerOf(" xai-abc123 "), "grok");
  assert.equal(providerOf("sk-ant-api03-abc"), "claude");
  assert.equal(providerOf(null), "claude");
});

test("Claude's tiers map onto Grok's models; a Grok model is kept", () => {
  assert.equal(grokModelFor("claude-haiku-5-5"), "grok-4.20-0309-non-reasoning");
  assert.equal(grokModelFor("claude-opus-5-5"), "grok-4.7");
  assert.equal(grokModelFor("claude-sonnet-5-5"), "grok-4.7");
  assert.equal(grokModelFor("grok-4.3"), "grok-4.3");
});

test("tools go over in Grok's shape, with its web search", () => {
  const tools = grokTools([{ name: "products", description: "List them", input_schema: { type: "object", properties: {} } }], true);
  assert.deepEqual(tools, [
    { type: "function", name: "products", description: "List them", parameters: { type: "object", properties: {} } },
    { type: "web_search" },
  ]);
});

test("a reply's text, tool calls, sources and cost are read out", () => {
  const r = readResponse({
    id: "resp_1",
    output: [
      { type: "web_search_call", id: "ws_1", status: "completed" },
      { type: "function_call", call_id: "call_1", name: "money_owed", arguments: '{"period":"month"}' },
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Cacao is ₱300/kg.", annotations: [{ type: "url_citation", url: "https://www.da.gov.ph/prices", title: "1" }] }],
      },
    ],
    usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 400 }, output_tokens: 50, output_tokens_details: { reasoning_tokens: 150 }, cost_in_usd_ticks: 25_000_000 },
  });
  assert.equal(r.id, "resp_1");
  assert.equal(r.text, "Cacao is ₱300/kg.");
  assert.deepEqual(r.calls, [{ callId: "call_1", name: "money_owed", input: { period: "month" } }]);
  assert.deepEqual(r.sources, [{ title: "da.gov.ph", url: "https://www.da.gov.ph/prices" }]);
  assert.equal(r.usedWeb, true);
  assert.equal(r.usage.input_tokens, 600);
  assert.equal(r.usage.cache_read_input_tokens, 400);
  assert.equal(r.usage.output_tokens, 200);
  assert.equal(costUsd("grok-4.7", r.usage), 0.0025);
});

test("Grok is priced from the table when xAI doesn't state the cost", () => {
  assert.equal(costUsd("grok-4.7", { input_tokens: 1_000_000, output_tokens: 1_000_000 }), 8);
  assert.equal(costUsd("grok-4.7", { cache_read_input_tokens: 1_000_000 }), 0.5);
  assert.equal(costUsd("grok-4.20-0309-non-reasoning", { output_tokens: 1_000_000 }), 2.5);
  assert.equal(costUsd("grok-4.7", { server_tool_use: { web_search_requests: 2 } }), 0.01);
});

test("Grok models get readable names", () => {
  assert.equal(modelLabel("grok-4.7"), "Grok 4.7");
  assert.equal(modelLabel("grok-4.20-0309-non-reasoning"), "Grok 4.20 (quick)");
  assert.equal(modelLabel("claude-haiku-5-5"), "Haiku 5.5");
});
