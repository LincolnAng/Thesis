"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Banknote, FileText, Landmark, Smartphone } from "lucide-react";
import { Segmented, type Choice } from "@/components/ui/segmented";
import { COMMON_EWALLETS, PAYMENT_METHOD_LABELS, describePaymentMethod, namesProvider } from "@/lib/format";
import type { PaymentMethod } from "@/lib/store/types";

/** Banks named most often here. Anything else can be typed — only the name is kept, never an account. */
export const COMMON_BANKS = ["BDO", "BPI", "Metrobank", "Landbank", "PNB", "Security Bank", "UnionBank", "RCBC", "China Bank"];

export const METHOD_LABELS = PAYMENT_METHOD_LABELS;

const METHOD_CHOICES: Choice<PaymentMethod>[] = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "bank_transfer", label: "Bank transfer", icon: Landmark },
  { value: "ewallet", label: "E-wallet", icon: Smartphone },
  { value: "check", label: "Cheque", icon: FileText },
];

/** "Cash", "Bank transfer · BDO", "E-wallet · GCash". Older payments without a method read "Not recorded". */
export function methodText(method: string | null | undefined, bankName: string | null | undefined): string {
  return describePaymentMethod(method, bankName) || "Not recorded";
}

/**
 * How the money moved: cash, bank transfer, e-wallet or cheque — and which bank or wallet. It's
 * picked from the common ones or typed; no account number, nickname or balance is asked for.
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
  const wallet = method === "ewallet";
  const names: readonly string[] = wallet ? COMMON_EWALLETS : COMMON_BANKS;
  const known = bankName != null && names.includes(bankName);
  const [other, setOther] = useState(Boolean(bankName) && !known);

  return (
    <div className="space-y-2">
      {label && <Label className="text-[13px] font-semibold text-foreground">{label}</Label>}
      <Segmented
        ariaLabel={label || "How it was paid"}
        value={(method as PaymentMethod | null) ?? "cash"}
        choices={METHOD_CHOICES}
        onChange={(v) => onChange({ method: v, bankName: namesProvider(v) && namesProvider(method) && (v === "ewallet") === (method === "ewallet") ? bankName : null })}
      />
      {namesProvider(method) && (
        <div className="space-y-2 rounded-xl border border-line/15 p-2.5">
          <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {wallet ? <Smartphone className="h-3.5 w-3.5" /> : <Landmark className="h-3.5 w-3.5" />}
            {wallet ? "Which e-wallet?" : "Which bank?"}
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {names.map((b) => (
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
              {wallet ? "Another e-wallet" : "Another bank"}
            </button>
          </div>
          {other && (
            <Input
              value={bankName ?? ""}
              placeholder={wallet ? "Type the e-wallet's name" : "Type the bank's name"}
              aria-label={wallet ? "E-wallet name" : "Bank name"}
              onChange={(e) => onChange({ method, bankName: e.target.value || null })}
              className="h-10"
            />
          )}
          {method === "bank_transfer" && !bankName?.trim() && <p className="text-xs text-danger">Pick or type the bank so this can be saved.</p>}
        </div>
      )}
    </div>
  );
}
