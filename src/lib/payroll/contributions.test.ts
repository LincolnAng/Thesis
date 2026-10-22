import { test } from "node:test";
import assert from "node:assert/strict";
import { contributionsFor, pagibig, philhealth, sss, sssMsc } from "./contributions.ts";

test("SSS: pay rounded into ₱500 brackets from ₱5,000 to ₱35,000; 5% worker, 10% + EC shop", () => {
  assert.equal(sssMsc(3000), 5000);
  assert.equal(sssMsc(5249), 5000);
  assert.equal(sssMsc(5250), 5500);
  assert.equal(sssMsc(13000), 13000);
  assert.equal(sssMsc(13240), 13000);
  assert.equal(sssMsc(13250), 13500);
  assert.equal(sssMsc(80000), 35000);
  assert.deepEqual(sss(13000), { employee: 650, employer: 1310 });
  assert.deepEqual(sss(25000), { employee: 1250, employer: 2530 });
});

test("PhilHealth 5% split in half, floor ₱10,000; Pag-IBIG 2% each up to ₱200", () => {
  assert.deepEqual(philhealth(8000), { employee: 250, employer: 250 });
  assert.deepEqual(philhealth(25000), { employee: 625, employer: 625 });
  assert.deepEqual(pagibig(25000), { employee: 200, employer: 200 });
  assert.deepEqual(pagibig(1500), { employee: 15, employer: 30 });
  assert.equal(contributionsFor(0, 0), null);
  assert.equal(contributionsFor(13000, 13000)?.employeeTotal, 650 + 325 + 200);
});
