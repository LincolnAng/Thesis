/**
 * Government contributions taken from pay — SSS, PhilHealth and Pag-IBIG — and the shop's own
 * share of each. Monthly amounts, from the month's pay. Pure (contributions.test.ts).
 *
 * Rates as of 2026 (check them each January — the agencies change them by circular):
 *   SSS        15% of the Monthly Salary Credit (MSC): 5% from the worker, 10% from the shop,
 *              plus the shop's EC charge (₱10, or ₱30 from a ₱15,000 MSC). The MSC is the pay
 *              rounded into ₱500 brackets, from ₱5,000 to ₱35,000.
 *   PhilHealth 5% of the monthly basic pay (floor ₱10,000, ceiling ₱100,000), half each.
 *   Pag-IBIG   2% each of pay up to ₱10,000 (₱200 each at most); 1% from the worker at
 *              ₱1,500 or less.
 *
 * The shop starts deducting from the date set on the Salaries tab (January 2027 by default).
 * Staff paid an allowance only (not a salary) have none taken off.
 */

export const DEFAULT_CONTRIBUTIONS_FROM = "2027-01-01";
export const CONTRIBUTIONS_FROM_KEY = "payrollContributionsFrom";

export type Agency = "sss" | "philhealth" | "pagibig";
export const AGENCY_LABELS: Record<Agency, string> = { sss: "SSS", philhealth: "PhilHealth", pagibig: "Pag-IBIG" };

export interface Contribution {
  employee: number;
  employer: number;
}

export type Contributions = Record<Agency, Contribution> & { employeeTotal: number; employerTotal: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function sssMsc(pay: number): number {
  if (pay < 5250) return 5000;
  if (pay >= 34750) return 35000;
  return 5500 + 500 * Math.floor((pay - 5250) / 500);
}

export function sss(pay: number): Contribution {
  const msc = sssMsc(pay);
  return { employee: r2(msc * 0.05), employer: r2(msc * 0.1 + (msc < 15000 ? 10 : 30)) };
}

export function philhealth(basic: number): Contribution {
  const base = Math.min(100000, Math.max(10000, basic));
  const half = r2((base * 0.05) / 2);
  return { employee: half, employer: half };
}

export function pagibig(pay: number): Contribution {
  const base = Math.min(10000, pay);
  return { employee: r2(base * (pay <= 1500 ? 0.01 : 0.02)), employer: r2(base * 0.02) };
}

/** A month's contributions from that month's pay (basic for PhilHealth; basic + overtime otherwise). */
export function contributionsFor(monthBasic: number, monthGross: number): Contributions | null {
  if (monthGross <= 0) return null;
  const c = { sss: sss(monthGross), philhealth: philhealth(monthBasic), pagibig: pagibig(monthGross) };
  return {
    ...c,
    employeeTotal: r2(c.sss.employee + c.philhealth.employee + c.pagibig.employee),
    employerTotal: r2(c.sss.employer + c.philhealth.employer + c.pagibig.employer),
  };
}
