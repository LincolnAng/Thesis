import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReminders } from "./reminders.ts";
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
  assert.match(old.today[0].title, /Ana owes ₱1,000/);
  assert.equal(buildReminders([], [sale({ timestamp: "2026-10-15T10:00:00" })], "2026-10-22").today.length, 0);
  assert.equal(buildReminders([], [sale({ amountPaid: 1000, paymentStatus: "settled" })], "2026-10-22").today.length, 0);
  assert.equal(buildReminders([], [sale({ dueDate: "2026-11-01" })], "2026-10-22").today.length, 0);
});
