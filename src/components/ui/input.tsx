import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, inputMode, onFocus, ...props }: React.ComponentProps<"input">) {
  // type="number" has a well-known browser quirk: when the displayed text and the
  // new value React sets are numerically equivalent (e.g. field shows "0", user
  // types "5" so the field briefly reads "05" — 05 === 5 numerically), the browser
  // silently ignores the DOM update, leaving the stale/concatenated text on screen
  // ("050", "0500", ...). Rendering as a plain text field with a numeric keyboard
  // (inputMode) sidesteps that entirely — callers already parse the string
  // themselves via Number(e.target.value). Selecting on focus means tapping into a
  // field already showing "0" replaces it instead of appending after it.
  const isNumeric = type === "number";
  return (
    <input
      type={isNumeric ? "text" : type}
      inputMode={isNumeric ? (inputMode ?? "decimal") : inputMode}
      onFocus={(e) => {
        if (isNumeric) e.target.select();
        onFocus?.(e);
      }}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
