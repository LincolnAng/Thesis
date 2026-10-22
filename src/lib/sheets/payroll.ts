import { createSheetCollection } from "./collection";
import type { DayStatus, PayrollRecord, StaffMember, TimeRecord } from "@/lib/store/types";

/**
 * Salaries: who is paid what (Staff), their daily time record (Time Records) and what they
 * were paid (Payroll). The real names and rates are entered on the Salaries tab and live only
 * in the sheet — the repository is public.
 */

const num = (s: string | undefined) => Number(s) || 0;

// New columns go on the end, so a tab made before them keeps lining up.
const STAFF_HEADER = ["id", "name", "payType", "rate", "position", "pwd", "userId", "startDate", "active", "createdAt", "deletedAt", "allowanceOnly"];

export const staffCollection = createSheetCollection<StaffMember>({
  sheetName: "People & Payroll",
  section: "Staff",
  header: STAFF_HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: (s) => [s.id, s.name, s.payType, String(s.rate), s.position, s.pwd ? "yes" : "", s.userId ?? "", s.startDate ?? "", s.active ? "yes" : "no", s.createdAt, "", s.allowanceOnly ? "yes" : ""],
  fromRow: ([id, name, payType, rate, position, pwd, userId, startDate, active, createdAt, , allowanceOnly]) =>
    id
      ? {
          id,
          name: name ?? "",
          payType: payType === "monthly" ? "monthly" : "daily",
          rate: num(rate),
          position: position ?? "",
          pwd: pwd === "yes",
          userId: userId || null,
          startDate: startDate || null,
          active: active !== "no",
          allowanceOnly: allowanceOnly === "yes",
          createdAt: createdAt || new Date().toISOString(),
        }
      : null,
});

const STATUSES: DayStatus[] = ["present", "half", "absent", "off", "leave"];
const TIME_HEADER = ["id", "staffId", "date", "timeIn", "timeOut", "status", "otHours", "note", "loggedById", "loggedByName", "createdAt", "deletedAt"];

export const timeRecordsCollection = createSheetCollection<TimeRecord>({
  sheetName: "People & Payroll",
  section: "Time record",
  header: TIME_HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: (t) => [t.id, t.staffId, t.date, t.timeIn ?? "", t.timeOut ?? "", t.status, String(t.otHours || 0), t.note ?? "", t.loggedById ?? "", t.loggedByName ?? "", t.createdAt, ""],
  fromRow: ([id, staffId, date, timeIn, timeOut, status, otHours, note, loggedById, loggedByName, createdAt]) =>
    id && staffId && date
      ? {
          id,
          staffId,
          date,
          timeIn: timeIn || null,
          timeOut: timeOut || null,
          status: STATUSES.includes(status as DayStatus) ? (status as DayStatus) : "present",
          otHours: num(otHours),
          note: note ?? "",
          loggedById: loggedById || null,
          loggedByName: loggedByName || null,
          createdAt: createdAt || new Date().toISOString(),
        }
      : null,
});

const PAYROLL_HEADER = ["id", "staffId", "kind", "periodStart", "periodEnd", "basic", "overtime", "deductions", "deductionNote", "net", "paidOn", "entryId", "createdAt", "deletedAt", "sss", "philhealth", "pagibig"];

export const payrollCollection = createSheetCollection<PayrollRecord>({
  sheetName: "People & Payroll",
  section: "Payroll",
  header: PAYROLL_HEADER,
  idColumn: "id",
  deletedColumn: "deletedAt",
  toRow: (p) => [p.id, p.staffId, p.kind, p.periodStart, p.periodEnd, String(p.basic), String(p.overtime), String(p.deductions), p.deductionNote ?? "", String(p.net), p.paidOn, p.entryId ?? "", p.createdAt, "", String(p.sss || 0), String(p.philhealth || 0), String(p.pagibig || 0)],
  fromRow: ([id, staffId, kind, periodStart, periodEnd, basic, overtime, deductions, deductionNote, net, paidOn, entryId, createdAt, , sss, philhealth, pagibig]) =>
    id && staffId
      ? {
          id,
          staffId,
          kind: kind === "13th" || kind === "remittance" ? kind : "regular",
          periodStart: periodStart ?? "",
          periodEnd: periodEnd ?? "",
          basic: num(basic),
          overtime: num(overtime),
          deductions: num(deductions),
          deductionNote: deductionNote ?? "",
          net: num(net),
          paidOn: paidOn ?? "",
          entryId: entryId || null,
          createdAt: createdAt || new Date().toISOString(),
          sss: num(sss),
          philhealth: num(philhealth),
          pagibig: num(pagibig),
        }
      : null,
});
