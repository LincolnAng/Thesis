import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveProduct } from "./product-resolve.ts";
import type { Product } from "@/lib/store/types";

const p = (id: string, name: string, sizeLabel: string | null, sizeOfId?: string): Product => ({ id, name, sizeLabel, sizeOfId }) as Product;
const products = [p("t150", "Cacao Tablea", "150g"), p("t250", "Cacao Tablea", "250g", "t150"), p("ice", "Tablea Ice Cream", "90g"), p("biko", "Ube Mango Biko", null)];

const id = (typed: string) => {
  const r = resolveProduct(products, typed);
  return r.kind === "one" ? r.product.id : r.kind;
};

test("typos, missing letters and filler words still find the product", () => {
  assert.equal(id("ube biko"), "biko");
  assert.equal(id("mango bikoo"), "biko");
  assert.equal(id("2 jars of tablea 250g"), "t250");
  assert.equal(id("tableya 250 g"), "t250");
  assert.equal(id("icecream tablea"), "ice");
});

test("a name that fits several products asks which", () => {
  const r = resolveProduct(products, "table products");
  assert.equal(r.kind, "several");
  assert.deepEqual(r.kind === "several" ? r.options.map((x) => x.id) : [], ["t150", "t250", "ice"]);
  assert.equal(id("cacao tablea"), "several");
});

test("sizes have to match exactly, and nonsense matches nothing", () => {
  assert.equal(id("tablea 350g"), "several"); // the size fits none, so it can't decide
  assert.equal(id("chocolate cake"), "none");
});
