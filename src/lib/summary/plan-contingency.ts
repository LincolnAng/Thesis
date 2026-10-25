/**
 * When the plan can't be met, what to actually do about it.
 *
 * The schedule was good at saying "20 jars won't be ready in time" and said nothing after
 * that. For the person reading it that is a dead end: the sentence names a problem she did not
 * choose, in a system she did not build, and leaves her to work out the remedy herself.
 *
 * Every entry here therefore pairs the problem with ONE concrete thing to change, and names the
 * actual day or material wherever it can — "free up Tue 13 Oct" beats "free up a day", because
 * the first is a decision and the second is homework.
 *
 * Ordered hardest-blocker first: there is no point suggesting she free up a day if no equipment
 * is configured, because the day would still have nowhere to put the work.
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

/** An amount of one thing, in its own unit. */
interface Amount {
  name: string;
  qty: number;
  unit: string;
}

export interface ContingencyInput {
  totalJarsToMake: number;
  /** Has a machine, but didn't all fit before the days ran out. */
  unplaced: Amount[];
  late: Amount[];
  expiring: Amount[];
  /** Needs making, but no machine makes it. */
  noMachine: Amount[];
  hasEquipment: boolean;
  /** Every day in the planning window, with its status and capacity. */
  days: { date: string; status: string; capacity: number; runs: unknown[] }[];
  /** Days the owner has marked herself off. */
  unavailable: string[];
  /** Materials she is short of and has to buy, if any. */
  shortMaterials: { name: string; short: number; unit: string }[];
}

function pretty(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const amount = (a: Amount) => `${Math.ceil(a.qty * 100) / 100} ${a.unit} of ${a.name}`;
/** "A", "A and B", "A, B and 2 more". */
function list(items: Amount[]): string {
  const shown = items.slice(0, 2).map(amount);
  if (items.length > 2) return `${shown.join(", ")} and ${items.length - 2} more`;
  return shown.join(" and ");
}

export function planContingencies(input: ContingencyInput): PlanFix[] {
  const fixes: PlanFix[] = [];
  if (input.totalJarsToMake <= 0) return fixes;

  // 1. Nothing can be scheduled at all. Every other suggestion is noise until this is fixed.
  if (!input.hasEquipment) {
    fixes.push({
      id: "no-equipment",
      problem: "Nothing can go on the calendar yet — the app doesn't know what you make with.",
      fix: "Add your machines under Settings, with what each one makes and how many an hour or a day.",
      severity: "blocked",
    });
    return fixes;
  }

  // 2. Some things have no machine at all, so no amount of free days will place them.
  if (input.noMachine.length > 0) {
    fixes.push({
      id: "no-machine",
      problem: `No machine makes ${input.noMachine.map((a) => a.name).slice(0, 3).join(", ")}${input.noMachine.length > 3 ? ` and ${input.noMachine.length - 3} more` : ""}, so ${input.noMachine.length === 1 ? "it" : "they"} can't go on the calendar.`,
      fix: "Under Settings, add it to the machine that makes it.",
      severity: "blocked",
    });
  }

  const openDays = input.days.filter((d) => d.status === "open");
  const blockedInWindow = input.unavailable.filter((u) => input.days.some((d) => d.date === u));
  const freeDays = openDays.filter((d) => d.capacity > 0 && d.runs.length === 0);
  const unplaced = input.unplaced;

  if (unplaced.length > 0) {
    if (openDays.length === 0) {
      // Every single day is off. Name the first one she could give back.
      const firstBlocked = blockedInWindow.sort()[0];
      fixes.push({
        id: "all-days-off",
        problem: `There is no working day left this month, so ${list(unplaced)} ${unplaced.length === 1 ? "has" : "have"} nowhere to go.`,
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
        problem: `Your calendar is full — ${list(unplaced)} won't fit.`,
        fix: `Free up ${pretty(next)}, or raise how many your machines make under Settings.`,
        severity: "blocked",
      });
    } else {
      // Every day is already working and still not enough: the constraint is capacity, not days.
      fixes.push({
        id: "not-enough-capacity",
        problem: `Every day is already a working day and ${list(unplaced)} still won't fit.`,
        fix: "Add a machine or raise how many it makes under Settings, or make a smaller amount this month.",
        severity: "blocked",
      });
    }
  }

  // 3. Placed, but after it is needed. Different problem, different fix.
  if (input.late.length > 0) {
    fixes.push({
      id: "late",
      problem: `${list(input.late)} won't be ready by the day ${input.late.length === 1 ? "it's" : "they're"} needed.`,
      fix: freeDays.length
        ? `Start earlier — ${pretty(freeDays[0].date)} is free.`
        : "Switch the schedule to Fastest, or free up an earlier day.",
      severity: "late",
    });
  }

  // 4. Placed early enough to go off before it is wanted.
  if (input.expiring.length > 0) {
    fixes.push({
      id: "expiring",
      problem: `${list(input.expiring)} would be made so early they'd be past their best before you sell them.`,
      fix: "Switch the schedule to Latest Start so they're made closer to when they're needed.",
      severity: "warning",
    });
  }

  // 5. A day is useless without the materials to use it, so this comes last but still comes.
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
