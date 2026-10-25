import type { Machine, MachineOutput } from "@/lib/store/types";

/**
 * What the equipment can turn out, read the way the schedule needs it: per item, per day.
 *
 * A machine saved before it could say what it makes has no `outputs`, and one cached in the
 * browser from then may lack `hoursPerDay`, so both are read defensively.
 *
 * Pure: no store, no React.
 */

export function outputsOf(m: Machine): MachineOutput[] {
  return Array.isArray(m.outputs) ? m.outputs : [];
}

export function hoursOf(m: Machine): number {
  return m.hoursPerDay > 0 ? m.hoursPerDay : 8;
}

/** How many of one output a full working day makes. */
export function perDay(m: Machine, o: MachineOutput): number {
  return Math.max(0, o.qty) * (o.per === "hour" ? hoursOf(m) : 1);
}

/** Monday = 0 … Sunday = 6, so "runs 6 days a week" reads as Mon–Sat. */
export function mondayFirstDay(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function runsOn(m: Machine, d: Date): boolean {
  return mondayFirstDay(d) < Math.max(0, Math.min(7, m.workingDaysPerWeek)) && outputsOf(m).some((o) => perDay(m, o) > 0);
}

/** Every machine that makes an item, with how many of it a day. */
export function makersOf(machines: Machine[], itemId: string): { machine: Machine; perDay: number }[] {
  return machines.flatMap((machine) =>
    outputsOf(machine)
      .filter((o) => o.itemId === itemId && perDay(machine, o) > 0)
      .map((o) => ({ machine, perDay: perDay(machine, o) })),
  );
}

export function hasEquipment(machines: Machine[]): boolean {
  return machines.some((m) => m.workingDaysPerWeek > 0 && outputsOf(m).some((o) => perDay(m, o) > 0));
}
