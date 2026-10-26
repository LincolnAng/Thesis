import { test } from "node:test";
import assert from "node:assert/strict";
import { costUsd } from "./spend.ts";

// What one AI response cost, for the monthly hard stop. Run with `npm test`.

test("priced per model from the tokens a response reports", () => {
  const usage = { input_tokens: 1_000_000, output_tokens: 1_000_000 };
  assert.equal(costUsd("claude-haiku-5-5", usage), 0.6);
  assert.equal(costUsd("claude-opus-5-5", usage), 24);
  assert.equal(costUsd("claude-sonnet-5-5", usage), 12);
});

test("cache reads are cheap, cache writes cost a quarter more, searches add a cent each", () => {
  assert.equal(costUsd("claude-opus-5-5", { cache_read_input_tokens: 1_000_000 }), 0.4);
  assert.equal(costUsd("claude-opus-5-5", { cache_creation_input_tokens: 1_000_000 }), 5);
  assert.equal(costUsd("claude-opus-5-5", { server_tool_use: { web_search_requests: 3 } }), 0.03);
});

test("an unknown model is priced as the dearest, so the limit errs on the safe side", () => {
  assert.equal(costUsd("some-new-model", { output_tokens: 1_000_000 }), 50);
});
