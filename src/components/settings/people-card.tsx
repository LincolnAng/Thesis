"use client";

import { useState } from "react";
import { Users, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/data-table/confirm-delete-button";
import { useStore } from "@/lib/store/use-store";
import { addUser, deleteUser, updateUser } from "@/lib/store/store";
import { hashPin, signOut, useCurrentUser } from "@/lib/auth/current-user";
import type { AppUser } from "@/lib/store/types";

/**
 * Who may use the app, and what everyone has been changing.
 *
 * The PIN is a "whose turn is it on the tablet" check, not a security boundary — it's
 * described that way here rather than implying more than it does.
 */

const SHOW_FIRST = 12;

function when(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function PeopleCard() {
  const { users, activity } = useStore();
  const me = useCurrentUser();
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<AppUser["role"]>("helper");
  const [resetting, setResetting] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");
  const [showAll, setShowAll] = useState(false);

  // Rows arrive from the sheet in the order they were written; newest first is what reads
  // like a log.
  const newestFirst = [...activity].sort((a, b) => b.at.localeCompare(a.at));
  const rows = showAll ? newestFirst : newestFirst.slice(0, SHOW_FIRST);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    // The id is part of the hash, so it has to exist before the PIN can be hashed — the
    // row is created first and its PIN set a moment later.
    const user = addUser(trimmed, "", role);
    if (pin.trim()) updateUser(user.id, { pinHash: await hashPin(user.id, pin) });
    setName("");
    setPin("");
    setRole("helper");
  }

  async function savePin(user: AppUser) {
    updateUser(user.id, { pinHash: await hashPin(user.id, newPin) });
    setResetting(null);
    setNewPin("");
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" /> Who can use this app
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Everyone picks their name when they open the app, and everything they save gets their name on it. The
            4-digit PIN keeps the helpers from saving as each other by accident — it is not a password, and anyone
            who can open your Google Sheet can change it.
          </p>

          {users.length > 0 && (
            <ul className="divide-y divide-border rounded-[var(--radius-panel)] border border-border">
              {users.map((user) => (
                <li key={user.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {user.name}
                      {me?.id === user.id && <span className="text-muted-foreground"> · you</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {user.role === "owner" ? "Owner" : "Helper"} · {user.pinHash ? "PIN set" : "no PIN"}
                    </span>
                  </span>
                  {resetting === user.id ? (
                    <span className="flex items-center gap-1.5">
                      <Input
                        autoFocus
                        type="password"
                        inputMode="numeric"
                        maxLength={8}
                        placeholder="New PIN"
                        className="h-9 w-24"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                        onKeyDown={(e) => e.key === "Enter" && void savePin(user)}
                      />
                      <Button size="sm" onClick={() => void savePin(user)}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setResetting(null)}>
                        Cancel
                      </Button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => updateUser(user.id, { role: user.role === "owner" ? "helper" : "owner" })}
                      >
                        Make {user.role === "owner" ? "helper" : "owner"}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => (setResetting(user.id), setNewPin(""))}>
                        Set PIN
                      </Button>
                      <ConfirmDeleteButton onConfirm={() => deleteUser(user.id)} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input
                className="h-9 w-40"
                placeholder="e.g. Kuya Jun"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void add()}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">PIN (optional)</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={8}
                className="h-9 w-24"
                placeholder="4 digits"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Can they</Label>
              <select
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as AppUser["role"])}
              >
                <option value="helper">Help out</option>
                <option value="owner">Run the business</option>
              </select>
            </div>
            <Button size="sm" disabled={!name.trim()} onClick={() => void add()}>
              Add person
            </Button>
          </div>

          {me && (
            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <span className="text-sm text-muted-foreground">
                Signed in as <span className="font-medium text-foreground">{me.name}</span>
              </span>
              <Button size="sm" variant="secondary" onClick={signOut}>
                Switch person
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
                {rows.map((row) => (
                  <li key={row.id} className="flex items-baseline justify-between gap-3 py-1.5">
                    <span className="min-w-0">
                      <span className="font-medium text-foreground">{row.userName}</span>{" "}
                      <span className="text-muted-foreground">{row.action}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{when(row.at)}</span>
                  </li>
                ))}
              </ul>
              {activity.length > SHOW_FIRST && (
                <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Show less" : `Show all ${activity.length}`}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
