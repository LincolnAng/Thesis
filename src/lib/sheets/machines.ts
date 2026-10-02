import { createSheetCollection } from "./collection";
import type { Machine } from "@/lib/store/types";

// hoursPerDay is appended strictly after deletedAt, so every column already written keeps
// its position and older rows simply read back without it.
const MACHINE_HEADER = [
  "id",
  "name",
  "batchesPerDay",
  "workingDaysPerWeek",
  "notes",
  "createdAt",
  "deletedAt",
  "hoursPerDay",
];

const DEFAULT_HOURS_PER_DAY = 8;

function toRow(m: Machine): string[] {
  return [
    m.id,
    m.name,
    String(m.batchesPerDay),
    String(m.workingDaysPerWeek),
    m.notes,
    m.createdAt,
    "",
    String(m.hoursPerDay),
  ];
}

function fromRow(row: string[]): Machine | null {
  const [id, name, batchesPerDay, workingDaysPerWeek, notes, createdAt, , hoursPerDay] = row;
  if (!id) return null;
  return {
    id,
    name: name ?? "",
    batchesPerDay: Number(batchesPerDay) || 0,
    // Blank means the row predates the column, so it gets a normal working day. An explicit
    // 0 is a real answer — the machine isn't running — and has to survive the round trip.
    hoursPerDay:
      hoursPerDay === "" || hoursPerDay === undefined ? DEFAULT_HOURS_PER_DAY : Number(hoursPerDay) || 0,
    workingDaysPerWeek: Number(workingDaysPerWeek) || 0,
    notes: notes ?? "",
    createdAt: createdAt || new Date().toISOString(),
  };
}

export const machinesCollection = createSheetCollection<Machine>({
  sheetName: "Machines",
  header: MACHINE_HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow,
  fromRow,
});
