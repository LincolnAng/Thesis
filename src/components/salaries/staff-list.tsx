"use client";

import { SearchSelect } from "@/components/ui/search-select";
import { useState } from "react";
import { Pencil, Plus, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BUTTON, Pill } from "@/components/ui/kit";
import { useStore } from "@/lib/store/use-store";
import { addStaff, updateStaff } from "@/lib/store/store";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
import { formatPeso } from "@/lib/format";
import type { PayType, StaffMember } from "@/lib/store/types";

/**
 * Who the shop pays, and how: a monthly or a daily rate. Someone who leaves is marked as no
 * longer working rather than deleted, so their past pay and 13th month stay on record.
 */

export const rateLabel = (s: Pick<StaffMember, "payType" | "rate">) => `${formatPeso(s.rate)} / ${s.payType === "monthly" ? "month" : "day"}`;

/** Where time in and out happens. */
function TimeInNote() {
  return (
    <section className="rounded-2xl border border-line/15 bg-card px-4 py-3">
      <p className="text-[15px] font-semibold">Time in and out</p>
      <p className="text-[13px] text-muted-foreground">
        Done only on the Admin profile, signed in on the main computer — for everyone, including staff with no profile of their own. Give a profile the Admin role in Settings → People.
      </p>
    </section>
  );
}

export function StaffList() {
  const exec = isExecutive(useCurrentUser());
  const { staff } = useStore();
  const [editing, setEditing] = useState<StaffMember | "new" | null>(null);
  const sorted = [...staff].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

  return (
    <div className="flex max-w-[760px] flex-col gap-3">
      <TimeInNote />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[14px] text-muted-foreground">
          {exec ? "Rates are seen by Executives and the Admin, who works out pay. Employees never see them." : "Who is paid what. Only an Executive changes these."}
        </p>
        {exec && (
          <button type="button" onClick={() => setEditing("new")} className={BUTTON.primary}>
            <Plus className="h-4 w-4" /> Add staff
          </button>
        )}
      </div>
      {sorted.length === 0 ? (
        <p className="rounded-2xl border border-line/15 bg-card px-4 py-8 text-center text-[14px] text-muted-foreground">
          No one yet. Add each person you pay, with their monthly or daily rate.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line/10 overflow-hidden rounded-2xl border border-line/15 bg-card">
          {sorted.map((s) => (
            <li key={s.id} className={`flex items-center gap-3 px-4 py-3 ${s.active ? "" : "opacity-60"}`}>
              <UserRound className="h-5 w-5 shrink-0 text-cacao" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-[15px] font-semibold">
                  {s.name}
                  {s.pwd && <Pill tone="brand">PWD</Pill>}
                  {s.allowanceOnly && <Pill>Allowance</Pill>}
                  {!s.active && <Pill>No longer working</Pill>}
                </p>
                <p className="text-[13px] text-muted-foreground">{[s.position, s.startDate ? `since ${s.startDate}` : null].filter(Boolean).join(" · ") || "—"}</p>
              </div>
              <span className="shrink-0 text-[14px] font-semibold tabular-nums">{rateLabel(s)}</span>
              {exec && (
                <button
                  type="button"
                  onClick={() => setEditing(s)}
                  aria-label={`Change ${s.name}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line/20 text-muted-foreground hover:bg-secondary"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <StaffDialog member={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StaffDialog({ member, onClose }: { member: StaffMember | null; onClose: () => void }) {
  const { users } = useStore();
  const [name, setName] = useState(member?.name ?? "");
  const [position, setPosition] = useState(member?.position ?? "");
  const [payType, setPayType] = useState<PayType>(member?.payType ?? "daily");
  const [rate, setRate] = useState(member ? String(member.rate) : "");
  const [startDate, setStartDate] = useState(member?.startDate ?? "");
  const [pwd, setPwd] = useState(member?.pwd ?? false);
  const [userId, setUserId] = useState(member?.userId ?? "");
  const [active, setActive] = useState(member?.active ?? true);
  const [allowanceOnly, setAllowanceOnly] = useState(member?.allowanceOnly ?? false);
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!name.trim()) return setError("Enter their name.");
    if (!(Number(rate) > 0)) return setError("Enter their rate.");
    const data = { name: name.trim(), position: position.trim(), payType, rate: Number(rate), startDate: startDate || null, pwd, userId: userId || null, active, allowanceOnly };
    if (member) updateStaff(member.id, data);
    else addStaff(data);
    onClose();
  }

  const field = "h-11 rounded-lg border border-input bg-transparent px-3 text-[15px] outline-none focus:border-cacao";
  const label = "flex flex-col gap-1 text-[13px] font-semibold";
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{member ? `Change ${member.name}` : "Add staff"}</DialogTitle>
          <DialogDescription>How they&apos;re paid. Their pay is worked out from this and their time record.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <label className={`${label} col-span-2`}>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
          </label>
          <label className={`${label} col-span-2`}>
            What they do
            <input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Production, Secretary (part-time)" className={field} />
          </label>
          <div className={`${label} col-span-2`}>
            Paid by the
            <div className="flex gap-2">
              {(["daily", "monthly"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPayType(t)}
                  className={`min-h-11 flex-1 rounded-lg border text-[14px] font-semibold ${payType === t ? "border-cacao bg-cacao text-ivory" : "border-line/20 bg-card"}`}
                >
                  {t === "daily" ? "Day" : "Month"}
                </button>
              ))}
            </div>
          </div>
          <label className={label}>
            Rate a {payType === "daily" ? "day" : "month"} (₱)
            <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ""))} className={`${field} text-right`} />
          </label>
          <label className={label}>
            Started on
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={field} />
          </label>
          <div className={`${label} col-span-2`}>
            Times in with the profile
            <SearchSelect
              value={userId}
              onChange={setUserId}
              options={[{ value: "", label: "No profile — timed in on the Admin profile" }, ...users.map((u) => ({ value: u.id, label: u.name }))]}
              ariaLabel="Profile"
            />
          </div>
          <label className="col-span-2 flex min-h-11 items-center gap-2 text-[14px]">
            <input type="checkbox" checked={pwd} onChange={(e) => setPwd(e.target.checked)} className="h-5 w-5 accent-[var(--color-cacao,#5a3a22)]" />
            Person with disability (PWD)
          </label>
          <label className="col-span-2 flex min-h-11 items-start gap-2 text-[14px]">
            <input type="checkbox" checked={allowanceOnly} onChange={(e) => setAllowanceOnly(e.target.checked)} className="mt-0.5 h-5 w-5" />
            <span>
              Allowance only, not a salary
              <span className="block text-[12px] text-muted-foreground">Nothing is taken off: no absences, no SSS, PhilHealth or Pag-IBIG.</span>
            </span>
          </label>
          {member && (
            <label className="col-span-2 flex min-h-11 items-center gap-2 text-[14px]">
              <input type="checkbox" checked={!active} onChange={(e) => setActive(!e.target.checked)} className="h-5 w-5" />
              No longer working here (kept on record, hidden from time in and payroll)
            </label>
          )}
        </div>
        {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={save} className="min-h-11 flex-1 rounded-[10px] bg-cacao text-[14px] font-semibold text-ivory">
            Save
          </button>
          <button type="button" onClick={onClose} className="min-h-11 rounded-[10px] border border-line/20 px-4 text-[14px] font-semibold">
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
