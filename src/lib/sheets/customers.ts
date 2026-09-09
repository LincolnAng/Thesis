import { createSheetCollection } from "./collection";
import type { Customer } from "@/lib/store/types";

const CUSTOMER_HEADER = ["id", "name", "contact", "notes", "deletedAt"];

function customerToRow(c: Customer): string[] {
  return [c.id, c.name, c.contact, c.notes, ""];
}

function customerFromRow(row: string[]): Customer | null {
  const [id, name, contact, notes] = row;
  if (!id) return null;
  return { id, name, contact: contact ?? "", notes: notes ?? "" };
}

export const customersCollection = createSheetCollection<Customer>({
  sheetName: "Customers",
  header: CUSTOMER_HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: customerToRow,
  fromRow: customerFromRow,
});
