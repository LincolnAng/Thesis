import { test } from "node:test";
import assert from "node:assert/strict";
import { modelFor, tierFor } from "./route-model.ts";

test("small talk goes to the quick model, records and lookups to the standard one, advice to the deep one", () => {
  for (const m of ["hi", "Thanks!", "salamat po", "ok"]) assert.equal(tierFor(m), "quick", m);
  for (const m of ["log 2 orders of tablea for Ana", "How much did we sell this month?", "benta 3 tablea kay aling nena", "Help me write a message to a supplier"]) assert.equal(tierFor(m), "standard", m);
  for (const m of ["Should we raise the price of tablea?", "Why are sales down this month?", "Give me a marketing plan for Christmas", "bakit mababa ang benta?"]) assert.equal(tierFor(m), "deep", m);
  assert.equal(tierFor("x".repeat(500)), "deep");
  assert.equal(modelFor("standard").model, "claude-sonnet-5-5");
  assert.equal(modelFor("quick").model, "claude-haiku-5-5");
  assert.equal(modelFor("deep", "claude-fable-5-1").model, "claude-fable-5-1");
});
