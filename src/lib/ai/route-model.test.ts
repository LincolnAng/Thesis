import { test } from "node:test";
import assert from "node:assert/strict";
import { modelFor, tierFor } from "./route-model.ts";

test("admin work goes to Haiku, everything else to Opus", () => {
  for (const m of [
    "hi",
    "Thanks!",
    "salamat po",
    "ok",
    "log 2 orders of tablea for Ana",
    "How much did we sell this month?",
    "benta 3 tablea kay aling nena",
    "Nena 3 tablea 450",
    "delete the last sale",
    "magkano ang gastos kahapon?",
  ])
    assert.equal(tierFor(m), "admin", m);
  for (const m of [
    "Should we raise the price of tablea?",
    "Why are sales down this month?",
    "Give me a marketing plan for Christmas",
    "bakit mababa ang benta?",
    "Help me write a message to a supplier",
    "What is the difference between tablea and cocoa powder?",
    "How can we sell more at bazaars?",
  ])
    assert.equal(tierFor(m), "deep", m);
  assert.equal(tierFor("x".repeat(500)), "deep");
  assert.equal(modelFor("admin").model, "claude-haiku-5-5");
  assert.equal(modelFor("deep").model, "claude-opus-5-5");
  assert.equal(modelFor("deep", "claude-fable-5-1").model, "claude-fable-5-1");
});
