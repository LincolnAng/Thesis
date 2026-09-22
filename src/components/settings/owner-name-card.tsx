"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store/use-store";
import { ownerName, setOwnerName } from "@/lib/summary/business-config";

/** The name Home greets you with. Saved when you leave the field, not on every keystroke. */
export function OwnerNameCard() {
  const { businessSettings } = useStore();
  const saved = ownerName(businessSettings);
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft !== null && draft.trim() !== saved) setOwnerName(draft);
    setDraft(null);
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
          placeholder="e.g. Auntie Sandy"
          value={draft ?? saved}
          onFocus={() => setDraft(saved)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <p className="text-xs text-muted-foreground">Home greets you with this — &ldquo;Hi, {(draft ?? saved) || "there"}&rdquo;.</p>
      </CardContent>
    </Card>
  );
}
