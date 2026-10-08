/**
 * When the plan can't be met, what to actually do about it.
 *
 * The schedule was good at saying "2 batches won't be ready in time" and said nothing after
 * that. For the person reading it that is a dead end: the sentence names a problem she did not
 * choose, in a system she did not build, and leaves her to work out the remedy herself.
 *
 * Every entry here therefore pairs the problem with ONE concrete thing to change, and names the
 * actual day or material wherever it can — "free up Tue 13 Oct" beats "free up a day", because
 * the first is a decision and the second is homework.
 *
 * Ordered hardest-blocker first: there is no point suggesting she free up a day if no equipment
 * is configured, because the day would still have nowhere to put the batch.
 *
 * Pure: no store, no React, so the branching can be tested without a browser.
 */

export type FixSeverity = "blocked" | "late" | "warning";

export interface PlanFix {
  id: string;
  /** What is wrong, in her words. */
  problem: string;
  /** The one thing to change. */
  fix: string;
  severity: FixSeverity;
}

export interface ContingencyInput {
  totalJarsToMake: number;
  batchesNeeded: number;
  batchesScheduled: number;
  batchesLate: number;
  batchesExpiring: number;
  hasEquipment: boolean;
  /** Every day in the planning window, with its status and capacity. */
  days: { date: string; status: string; capacity: number; runs: unknown[] }[];
  /** Days the owner has marked herself off. */
  unavailable: string[];
  /** Materials she is short of, if any. */
  shortMaterials: { name: string; short: number; unit: string }[];
  /** How many batches a day the equipment can manage, for the "raise it" suggestion. */
  batchesPerDay: number;
}

function pretty(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function planContingencies(input: ContingencyInput): PlanFix[] {
  const fixes: PlanFix[] = [];
  if (input.totalJarsToMake <= 0) return fixes;

  const unplaced = Math.max(0, input.batchesNeeded - input.batchesScheduled);

  // 1. Nothing can be scheduled at all. Every other suggestion is noise until this is fixed.
  if (!input.hasEquipment) {
    fixes.push({
      id: "no-equipment",
      problem: "Nothing can go on the calendar yet — the app doesn't know what you make with.",
      fix: "Add your equipment under Settings, and say how many batches a day it can do.",
      severity: "blocked",
    });
    return fixes;
  }

  const openDays = input.days.filter((d) => d.status === "open");
  const blockedInWindow = input.unavailable.filter((u) => input.days.some((d) => d.date === u));
  const freeDays = openDays.filter((d) => d.capacity > 0 && d.runs.length === 0);

  if (unplaced > 0) {
    if (openDays.length === 0) {
      // Every single day is off. Name the first one she could give back.
      const firstBlocked = blockedInWindow.sort()[0];
      fixes.push({
        id: "all-days-off",
        problem: `There is no working day left this month, so ${unplaced === 1 ? "that batch" : `those ${unplaced} batches`} have nowhere to go.`,
        fix: firstBlocked
          ? `Free up ${pretty(firstBlocked)} on the calendar — tap it to put yourself back on.`
          : "Mark at least one day as a working day on the calendar.",
        severity: "blocked",
      });
    } else if (blockedInWindow.length > 0) {
      // There ARE days off she could take back. That is the cheapest fix, so offer it first.
      const next = blockedInWindow.sort()[0];
      fixes.push({
        id: "free-up-a-day",
        problem: `Your calendar is full — ${unplaced === 1 ? "1 batch has" : `${unplaced} batches have`} nowhere to go.`,
        fix: `Free up ${pretty(next)}, or raise how many batches a day you can do${input.batchesPerDay > 0 ? ` (now ${input.batchesPerDay})` : ""}.`,
        severity: "blocked",
      });
    } else {
      // Every day is already working and still not enough: the constraint is capacity, not days.
      fixes.push({
        id: "not-enough-capacity",
        problem: `Every day is already a working day and ${unplaced === 1 ? "1 batch" : `${unplaced} batches`} still won't fit.`,
        fix:
          input.batchesPerDay > 0
            ? `Raise batches a day above ${input.batchesPerDay} under Settings, or make a smaller amount this month.`
            : "Raise how many batches a day your equipment can do, under Settings.",
        severity: "blocked",
      });
    }
  }

  // 2. Placed, but after it is needed. Different problem, different fix.
  if (input.batchesLate > 0) {
    fixes.push({
      id: "late",
      problem: `${input.batchesLate === 1 ? "1 batch lands" : `${input.batchesLate} batches land`} after you need ${input.batchesLate === 1 ? "it" : "them"}.`,
      fix: freeDays.length
        ? `Start earlier — ${pretty(freeDays[0].date)} is free.`
        : "Switch the schedule to Fastest, or free up an earlier day.",
      severity: "late",
    });
  }

  // 3. Placed early enough to go off before it is wanted.
  if (input.batchesExpiring > 0) {
    fixes.push({
      id: "expiring",
      problem: `${input.batchesExpiring === 1 ? "1 batch" : `${input.batchesExpiring} batches`} would be made so early they'd be past their best before you sell them.`,
      fix: "Switch the schedule to Min expiry so they're made closer to when they're needed.",
      severity: "warning",
    });
  }

  // 4. A day is useless without the materials to use it, so this comes last but still comes.
  for (const material of input.shortMaterials.slice(0, 3)) {
    fixes.push({
      id: `short-${material.name}`,
      problem: `Not enough ${material.name} for everything you need to make.`,
      fix: `Buy about ${Math.ceil(material.short * 100) / 100} ${material.unit} more before you start.`,
      severity: "blocked",
    });
  }

  return fixes;
}
