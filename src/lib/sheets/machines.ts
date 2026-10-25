import { createSheetCollection } from "./collection";
import type { Machine, MachineOutput } from "@/lib/store/types";

// "batchesPerDay" is the old way capacity was given; it stays in the header so the columns
// after it don't move, and is written empty.
const MACHINE_HEADER = ["id", "name", "batchesPerDay", "workingDaysPerWeek", "notes", "createdAt", "deletedAt", "outputs", "hoursPerDay"];

function toRow(m: Machine): string[] {
  return [m.id, m.name, "", String(m.workingDaysPerWeek), m.notes, m.createdAt, "", JSON.stringify(m.outputs ?? []), String(m.hoursPerDay)];
}

function parseOutputs(raw: string | undefined): MachineOutput[] {
  try {
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list)
      ? list
          .filter((o) => o && typeof o.itemId === "string")
          .map((o) => ({
            itemId: o.itemId,
            kind: o.kind === "material" ? "material" : "product",
            qty: Number(o.qty) || 0,
            per: o.per === "hour" ? "hour" : "day",
          }))
      : [];
  } catch {
    return [];
  }
}

function fromRow(row: string[]): Machine | null {
  const [id, name, , workingDaysPerWeek, notes, createdAt, , outputs, hoursPerDay] = row;
  if (!id) return null;
  return {
    id,
    name: name ?? "",
    outputs: parseOutputs(outputs),
    hoursPerDay: Number(hoursPerDay) || 8,
    workingDaysPerWeek: Number(workingDaysPerWeek) || 0,
    notes: notes ?? "",
    createdAt: createdAt || new Date().toISOString(),
  };
}

export const machinesCollection = createSheetCollection<Machine>({
  sheetName: "Shop Setup",
  section: "Machine",
  header: MACHINE_HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow,
  fromRow,
});
