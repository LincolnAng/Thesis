"use client";

import { useState } from "react";

/**
 * Buffers a numeric input's raw typed text separately from the parsed number.
 * Without this, a field whose value is `Number(e.target.value) || 0` fed straight
 * back in as the controlled value silently eats anything typed after the integer
 * part — "12." rounds to 12, then the next digit appends to "12" instead of
 * continuing the decimal, so typing "12.50" becomes "1250". Keeping the display
 * text as its own state (seeded once from the initial value) lets the user
 * actually finish typing a decimal while still propagating a parsed number to the
 * caller on every keystroke for anything that needs to recompute live.
 */
export function useNumericDraft(initialValue: number, onChange: (n: number) => void) {
  const [text, setText] = useState(() => String(initialValue));

  function handleChange(raw: string) {
    setText(raw);
    onChange(Number(raw) || 0);
  }

  return { value: text, onChange: handleChange };
}
