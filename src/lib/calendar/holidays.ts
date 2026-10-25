/**
 * Philippine holidays for the Calendar. The official list (regular and special non-working days,
 * including the ones that move — Holy Week, Chinese New Year, Eid) is fetched by
 * /api/holidays; the fixed-date ones below are the fallback when that can't be reached.
 */

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  localName: string;
}

const FIXED: [string, string, string][] = [
  ["01-01", "New Year's Day", "Bagong Taon"],
  ["04-09", "Day of Valor", "Araw ng Kagitingan"],
  ["05-01", "Labour Day", "Araw ng Paggawa"],
  ["06-12", "Independence Day", "Araw ng Kalayaan"],
  ["08-21", "Ninoy Aquino Day", "Araw ng Kamatayan ni Ninoy Aquino"],
  ["11-01", "All Saints' Day", "Undas"],
  ["11-02", "All Souls' Day", "Araw ng mga Kaluluwa"],
  ["11-30", "Bonifacio Day", "Araw ni Bonifacio"],
  ["12-08", "Feast of the Immaculate Conception", "Kapistahan ng Immaculada Concepcion"],
  ["12-24", "Christmas Eve", "Bisperas ng Pasko"],
  ["12-25", "Christmas Day", "Araw ng Pasko"],
  ["12-30", "Rizal Day", "Araw ni Rizal"],
  ["12-31", "Last Day of the Year", "Huling Araw ng Taon"],
];

export function fixedHolidays(year: number): Holiday[] {
  return FIXED.map(([md, name, localName]) => ({ date: `${year}-${md}`, name, localName }));
}
