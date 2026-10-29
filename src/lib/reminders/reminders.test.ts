import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReminders, endOfNextMonth, isStockAlert } from "./reminders.ts";
import type { CalendarEntry } from "@/lib/calendar/entries";
import type { Entry } from "@/lib/store/types";

const cal = (over: Partial<CalendarEntry>): CalendarEntry => ({ id: "x", category: "events", date: "2026-10-22", title: "Weekend market", details: [], tone: "good", ...over });
const sale = (over: Partial<Entry>): Entry =>
  ({ id: "s1", timestamp: "2026-10-01T10:00:00", type: "SALE", amount: 1000, quantity: 2, unit: null, sku: "Tablea", counterparty: "Ana", location: null, priceType: "standard", category: null, rawText: "", confidence: 1, paymentTerm: "receivable", ...over }) as Entry;

test("today's events, overdue payments and alerts are today; the next few days are coming up", () => {
  const r = buildReminders(
    [
      cal({ id: "e1" }),
      cal({ id: "p-late", category: "payments", date: "2026-10-18", title: "To pay: ₱500", subtitle: "to Jars Co · 4 days overdue", tone: "bad" }),
      cal({ id: "p-soon", category: "payments", date: "2026-10-24", title: "To collect: ₱800", subtitle: "from Ana", tone: "warn" }),
      cal({ id: "p-far", category: "payments", date: "2026-11-30", title: "To collect: ₱1", tone: "warn" }),
      cal({ id: "low", category: "alerts", title: "Low: Tablea", tone: "warn" }),
      cal({ id: "ship", category: "shipments", title: "Sent 5" }),
    ],
    [],
    "2026-10-22",
  );
  assert.deepEqual(r.today.map((x) => x.id), ["p-late", "low", "e1"]);
  assert.deepEqual(r.upcoming.map((x) => x.id), ["p-soon"]);
  assert.equal(r.urgentCount, 2);
});

test("a receivable with no due date gets a follow-up after two weeks, until it's paid", () => {
  const old = buildReminders([], [sale({})], "2026-10-22");
  assert.equal(old.today[0]?.id, "followup:s1");
  assert.match(old.today[0].title, /Ask Ana to pay ₱1,000/);
  assert.equal(buildReminders([], [sale({ timestamp: "2026-10-15T10:00:00" })], "2026-10-22").today.length, 0);
  assert.equal(buildReminders([], [sale({ amountPaid: 1000, paymentStatus: "settled" })], "2026-10-22").today.length, 0);
  assert.equal(buildReminders([], [sale({ dueDate: "2026-11-01" })], "2026-10-22").today.length, 0);
});

test("each reminder reads as a short instruction, with stock kept apart", () => {
  const r = buildReminders(
    [
      cal({ id: "col", category: "payments", date: "2026-10-22", title: "To collect: ₱800", subtitle: "from Ana", tone: "warn" }),
      cal({ id: "pay", category: "payments", date: "2026-10-20", title: "To pay: ₱500", subtitle: "to Jars Co · 2 days overdue", tone: "bad" }),
      cal({ id: "make", category: "production", title: "Make Cacao Tablea", subtitle: "2 batches · about 24 jars · suggested", tone: "neutral" }),
      cal({ id: "low", category: "alerts", title: "Low: Cacao Tablea", subtitle: "3 jars left", tone: "warn" }),
      cal({ id: "buy", category: "alerts", title: "Buy more: Cacao beans", subtitle: "2 kg short for the plan", tone: "warn" }),
      cal({ id: "lv", category: "leaves", title: "On leave: Shiela", tone: "neutral" }),
    ],
    [],
    "2026-10-22",
  );
  const t = Object.fromEntries(r.today.map((x) => [x.id, [x.title, x.detail]]));
  assert.deepEqual(t.col, ["Collect ₱800 from Ana", "Due today"]);
  assert.deepEqual(t.pay, ["Pay Jars Co ₱500", "2 days late"]);
  assert.equal(t.make[0], "Make 2 batches of Cacao Tablea");
  assert.deepEqual(t.low, ["Make more Cacao Tablea", "3 jars left"]);
  assert.deepEqual(t.buy, ["Buy Cacao beans", "2 kg short"]);
  assert.equal(t.lv[0], "Shiela is on leave");
  assert.deepEqual(r.today.filter(isStockAlert).map((x) => x.id), ["low", "buy"]);
});

test("holidays and days off show in Coming up through the end of next month; everything else, the next few days", () => {
  assert.equal(endOfNextMonth("2026-10-29"), "2026-11-30");
  assert.equal(endOfNextMonth("2026-12-15"), "2027-01-31");
  assert.equal(endOfNextMonth("2027-01-31"), "2027-02-28");
  const r = buildReminders(
    [
      cal({ id: "hol-soon", category: "holidays", date: "2026-11-01", title: "Holiday: All Saints' Day" }),
      cal({ id: "hol-later", category: "holidays", date: "2026-11-30", title: "Holiday: Bonifacio Day" }),
      cal({ id: "hol-too-far", category: "holidays", date: "2026-12-08", title: "Holiday: Immaculate Conception" }),
      cal({ id: "off-later", category: "dayoffs", date: "2026-11-15", title: "Day off" }),
      cal({ id: "event-later", category: "events", date: "2026-11-15", title: "Bazaar" }),
    ],
    [],
    "2026-10-29",
  );
  assert.deepEqual(r.upcoming.map((x) => x.id), ["hol-soon", "off-later", "hol-later"]);
});
