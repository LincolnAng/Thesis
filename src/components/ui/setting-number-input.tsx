"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * A number field bound to a stored setting. While focused it keeps the owner's raw typing
 * (so "12." isn't eaten); otherwise it shows the stored value, so it updates when settings
 * finish loading from Sheets after the field first appears. Saves on blur or Enter.
 */
export function SettingNumberInput({
  value,
  onCommit,
  className,
  placeholder = "0",
}: {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      type="number"
      className={className}
      placeholder={placeholder}
      value={draft ?? (value ? String(value) : "")}
      onFocus={() => setDraft(value ? String(value) : "")}
      // Saves once, when the owner leaves the field — not on every keystroke, which sent a
      // write to Sheets per digit and ran the app into Sheets' request quota.
      onBlur={() => {
        if (draft !== null && (Number(draft) || 0) !== value) onCommit(Number(draft) || 0);
        setDraft(null);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      onChange={(e) => setDraft(e.target.value)}
    />
  );
}
