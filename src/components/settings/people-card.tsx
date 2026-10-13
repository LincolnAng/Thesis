"use client";

import { useState } from "react";
import { Users, History, Undo2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/data-table/confirm-delete-button";
import { useStore } from "@/lib/store/use-store";
import { canUndo, createProfile, deleteProfile, undoActivity, updateProfile } from "@/lib/store/store";
import { isExecutive, signOut, useCurrentUser } from "@/lib/auth/current-user";
import type { AppUser, Role } from "@/lib/store/types";

/**
 * Who may use the app, what each person can see, and what everyone has been changing.
 *
 * Executives add people, choose their role and reset PINs; everyone else sees the list and can
 * change only their own PIN. The server enforces the same (api/auth/profiles), so this screen
 * is the convenient half of the rule, not the rule.
 *
 * The PIN is a "whose turn is it on the tablet" check, not a security boundary — it's
 * described that way here rather than implying more than it does.
 */

const SHOW_FIRST = 12;

const ROLE_HINT: Record<Role, string> = {
  executive: "Executive — sees everything, including costs, R&D and payroll",
  employee: "Employee — logs sales, spoilage and batches; no costs or profit",
};

const REASONS: Record<string, string> = {
  forbidden: "Only an Executive can do that.",
  name_taken: "Someone already has that name.",
  last_executive: "There has to be at least one Executive.",
  pin_must_be_4_digits: "The PIN has to be 4 digits.",
  missing_name: "Type a name first.",
  offline: "Couldn't reach the server. Check your connection.",
};

function when(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function RolePicker({ value, onChange, disabled }: { value: Role; onChange: (r: Role) => void; disabled?: boolean }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Role)}
      className="h-11 rounded-md border border-input bg-transparent px-2 text-sm disabled:opacity-60"
      aria-label="Role"
    >
      <option value="executive">Executive</option>
      <option value="employee">Employee</option>
    </select>
  );
}

export function PeopleCard() {
  const { users } = useStore();
  const me = useCurrentUser();
  const exec = isExecutive(me);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [resetting, setResetting] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(action: Promise<{ ok: boolean; reason?: string }>): Promise<boolean> {
    setError(null);
    const result = await action;
    if (!result.ok) setError(REASONS[result.reason ?? ""] ?? "That didn't save. Try again.");
    return result.ok;
  }

  async function add() {
    const trimmed = name.trim();
    if (!trimmed || pin.length !== 4) return;
    if (await run(createProfile({ name: trimmed, pin, role }))) {
      setName("");
      setPin("");
      setRole("employee");
    }
  }

  async function savePin(user: AppUser) {
    if (await run(updateProfile(user.id, { pin: newPin }))) {
      setResetting(null);
      setNewPin("");
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" /> People using this app
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Everyone picks their profile when they open the app, on any device, and everything they save gets their name
            on it. {exec ? "You can add people and choose what they see." : "Only an Executive can add people or change roles."}{" "}
            The PIN keeps people sharing a tablet apart; it is not a password, and anyone with access to the Google Sheet
            can see every record in it.
          </p>

          {users.length > 0 && (
            <ul className="divide-y divide-border rounded-[var(--radius-panel)] border border-border">
              {users.map((user) => {
                const mine = me?.id === user.id;
                return (
                  <li key={user.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {user.name}
                        {mine && <span className="text-muted-foreground"> · you</span>}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {ROLE_HINT[user.role]}
                        {!user.hasPin && " · no PIN yet"}
                      </span>
                    </span>
                    {resetting === user.id ? (
                      <span className="flex items-center gap-1.5">
                        <Input
                          autoFocus
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="New PIN"
                          className="h-11 w-24"
                          value={newPin}
                          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                          onKeyDown={(e) => e.key === "Enter" && void savePin(user)}
                        />
                        <Button className="min-h-11" onClick={() => void savePin(user)} disabled={newPin.length !== 4}>
                          Save
                        </Button>
                        <Button className="min-h-11" variant="ghost" onClick={() => setResetting(null)}>
                          Cancel
                        </Button>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        {exec && (
                          <RolePicker value={user.role} onChange={(r) => void run(updateProfile(user.id, { role: r }))} />
                        )}
                        {(exec || mine) && (
                          <Button className="min-h-11" variant="secondary" onClick={() => (setResetting(user.id), setNewPin(""))}>
                            Set PIN
                          </Button>
                        )}
                        {exec && !mine && <ConfirmDeleteButton onConfirm={() => void run(deleteProfile(user.id))} />}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {exec && (
            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input
                  className="h-11 w-40"
                  placeholder="e.g. Kuya Jun"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void add()}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">4-digit PIN</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  className="h-11 w-24"
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Role</Label>
                <RolePicker value={role} onChange={setRole} />
              </div>
              <Button className="min-h-11" disabled={!name.trim() || pin.length !== 4} onClick={() => void add()}>
                Add person
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          {me && (
            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <span className="text-sm text-muted-foreground">
                Signed in as <span className="font-medium text-foreground">{me.name}</span>
              </span>
              <Button className="min-h-11" variant="secondary" onClick={() => void signOut()}>
                Switch person
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

/** Everything anyone changed, newest first, with an undo where one is possible. */
export function ActivityCard() {
  const { activity } = useStore();
  const [showAll, setShowAll] = useState(false);
  // Rows arrive from the sheet in the order they were written; newest first is what reads
  // like a log.
  const newestFirst = [...activity].sort((a, b) => b.at.localeCompare(a.at));
  const rows = showAll ? newestFirst : newestFirst.slice(0, SHOW_FIRST);

  return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" /> Recent activity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing logged yet. From now on, every save is recorded here with who made it.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-border text-sm">
                {rows.map((row) => {
                  const undoable = canUndo(row);
                  return (
                    <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-foreground">{row.userName}</span>{" "}
                        <span className={row.undoneAt ? "text-muted-foreground line-through" : "text-muted-foreground"}>
                          {row.action}
                        </span>
                        {row.undoneAt && <span className="ml-2 text-xs font-semibold text-[#9A6B12]">undone</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        {undoable && (
                          <button
                            type="button"
                            onClick={() => undoActivity(row.id)}
                            className="flex items-center gap-1 rounded-md border border-cacao/30 px-2 py-0.5 text-xs font-semibold text-cacao hover:bg-cacao/[0.06]"
                          >
                            <Undo2 className="h-3 w-3" /> Undo
                          </button>
                        )}
                        <span className="text-xs text-muted-foreground">{when(row.at)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
                Undo puts a transaction back exactly as it was, stock and ingredients included. It is offered only for
                transactions, and only for changes recorded since the log started keeping the previous version.
              </p>
              {activity.length > SHOW_FIRST && (
                <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Show less" : `Show all ${activity.length}`}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
  );
}
