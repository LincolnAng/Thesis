"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * A number field bound to a stored setting. While focused it keeps the owner's raw typing
 * (so "12." isn't eaten); otherwise it shows the stored value, so it updates when settings
 * finish loading from Sheets after the field first appears.
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
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        setDraft(e.target.value);
        onCommit(Number(e.target.value) || 0);
      }}
    />
  );
}
