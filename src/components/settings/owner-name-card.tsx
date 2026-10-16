"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCurrentUser } from "@/lib/auth/current-user";
import { updateProfile } from "@/lib/store/store";

const PROBLEM: Record<string, string> = {
  name_taken: "Someone already has that name.",
  missing_name: "Your name can't be empty.",
};

/**
 * Your name, as it shows on the sign-in screen, on everything you save, and in Home's greeting.
 * It is the signed-in profile's own name — there used to be a separate "owner name" here that
 * nothing read any more. Saved when you leave the field, not on every keystroke.
 */
export function YourNameCard() {
  const me = useCurrentUser();
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  if (!me) return null;
  const saved = me.name;

  async function commit() {
    const next = draft?.trim() ?? "";
    setDraft(null);
    if (!me || draft === null || next === saved) return;
    const result = await updateProfile(me.id, { name: next });
    setMessage(result.ok ? { ok: true, text: "Saved." } : { ok: false, text: PROBLEM[result.reason ?? ""] ?? "Couldn't save — try again." });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserRound className="h-4 w-4" /> Your name
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Input
          value={draft ?? saved}
          onFocus={() => {
            setDraft(saved);
            setMessage(null);
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <p className={`text-xs ${message && !message.ok ? "text-danger" : "text-muted-foreground"}`}>
          {message?.text ?? `Shown on the sign-in screen, on everything you save, and on Home — "Hello, ${(draft ?? saved) || "there"}".`}
        </p>
      </CardContent>
    </Card>
  );
}
