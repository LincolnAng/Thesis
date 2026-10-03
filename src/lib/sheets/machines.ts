import { createSheetCollection } from "./collection";
import type { Machine } from "@/lib/store/types";

const MACHINE_HEADER = ["id", "name", "batchesPerDay", "workingDaysPerWeek", "notes", "createdAt", "deletedAt"];

function toRow(m: Machine): string[] {
  return [m.id, m.name, String(m.batchesPerDay), String(m.workingDaysPerWeek), m.notes, m.createdAt, ""];
}

function fromRow(row: string[]): Machine | null {
  const [id, name, batchesPerDay, workingDaysPerWeek, notes, createdAt] = row;
  if (!id) return null;
  return {
    id,
    name: name ?? "",
    batchesPerDay: Number(batchesPerDay) || 0,
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
