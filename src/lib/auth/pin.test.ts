import { test } from "node:test";
import assert from "node:assert/strict";
import { legacyHash, pinColumns, verifyPin } from "./pin.ts";

const base = { id: "u1", name: "Jai", role: "executive" as const, color: "", hasPin: true, createdAt: "", pinSecure: "", pinHash: "", pin: "" };

test("a new PIN is stored hashed, never as digits, and checks out", () => {
  const cols = pinColumns("u1", "4821", false);
  assert.equal(cols.pin, "");
  assert.equal(cols.pinHash, "");
  assert.ok(cols.pinSecure.startsWith("scrypt$"));
  assert.ok(!cols.pinSecure.includes("4821"));
  assert.deepEqual(verifyPin({ ...base, ...cols }, "4821"), { ok: true, upgrade: false });
  assert.equal(verifyPin({ ...base, ...cols }, "1111").ok, false);
});

test("the same PIN for two people gives two different hashes", () => {
  assert.notEqual(pinColumns("u1", "4821", false).pinSecure, pinColumns("u2", "4821", false).pinSecure);
});

test("during the transition a PIN also gets the hash the live site checks", () => {
  assert.equal(pinColumns("u1", "4821", true).pinHash, legacyHash("u1", "4821"));
});

test("digits typed into the sheet and old hashes still sign in, and ask to be upgraded", () => {
  assert.deepEqual(verifyPin({ ...base, pin: "4821" }, "4821"), { ok: true, upgrade: true });
  assert.equal(verifyPin({ ...base, pin: "4821" }, "0000").ok, false);
  assert.deepEqual(verifyPin({ ...base, pinHash: legacyHash("u1", "4821") }, "4821"), { ok: true, upgrade: true });
});

test("the scrypt hash wins over stale legacy columns", () => {
  const cols = pinColumns("u1", "4821", false);
  assert.equal(verifyPin({ ...base, ...cols, pin: "9999" }, "9999").ok, false);
});
