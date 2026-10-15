"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChipGroup } from "@/components/ui/chip-group";

/** Banks named most often here. Anything else can be typed — only the name is kept, never an account. */
export const COMMON_BANKS = ["BDO", "BPI", "Metrobank", "Landbank", "PNB", "Security Bank", "UnionBank", "RCBC", "China Bank"];

export const METHOD_LABELS: Record<string, string> = { cash: "Cash", bank_transfer: "Bank transfer" };

/** "Cash", or "Bank transfer · BDO". Older payments without a method read "Not recorded". */
export function methodText(method: string | null | undefined, bankName: string | null | undefined): string {
  if (!method) return "Not recorded";
  if (method === "bank_transfer") return bankName ? `Bank transfer · ${bankName}` : "Bank transfer";
  return METHOD_LABELS[method] ?? method;
}

/**
 * How the money moved: Cash or Bank transfer, and — only for a transfer — which bank. The bank
 * is picked from the common ones or typed; no account number, nickname or balance is asked for.
 */
export function MethodFields({
  method,
  bankName,
  onChange,
  label = "How was it paid?",
}: {
  method: string | null;
  bankName: string | null;
  onChange: (next: { method: string | null; bankName: string | null }) => void;
  label?: string;
}) {
  const known = bankName != null && COMMON_BANKS.includes(bankName);
  const [other, setOther] = useState(Boolean(bankName) && !known);

  return (
    <div className="space-y-2">
      <Label className="text-[13px] font-semibold text-foreground">{label}</Label>
      <ChipGroup
        options={["cash", "bank_transfer"]}
        value={method ?? ""}
        labels={METHOD_LABELS}
        onChange={(v) => onChange({ method: v, bankName: v === "bank_transfer" ? bankName : null })}
      />
      {method === "bank_transfer" && (
        <div className="space-y-2 rounded-xl border border-line/15 p-2.5">
          <Label className="text-xs text-muted-foreground">Which bank?</Label>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_BANKS.map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={bankName === b && !other}
                onClick={() => {
                  setOther(false);
                  onChange({ method, bankName: b });
                }}
                className={`min-h-9 rounded-full border px-3 text-[13px] ${
                  bankName === b && !other ? "border-cacao bg-cacao font-semibold text-ivory" : "border-line/20 bg-card"
                }`}
              >
                {b}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={other}
              onClick={() => {
                setOther(true);
                if (known) onChange({ method, bankName: null });
              }}
              className={`min-h-9 rounded-full border px-3 text-[13px] ${
                other ? "border-cacao bg-cacao font-semibold text-ivory" : "border-line/20 bg-card"
              }`}
            >
              Another bank
            </button>
          </div>
          {other && (
            <Input
              value={bankName ?? ""}
              placeholder="Type the bank's name"
              aria-label="Bank name"
              onChange={(e) => onChange({ method, bankName: e.target.value || null })}
              className="h-10"
            />
          )}
          {!bankName?.trim() && <p className="text-xs text-danger">Pick or type the bank so this can be saved.</p>}
        </div>
      )}
    </div>
  );
}
