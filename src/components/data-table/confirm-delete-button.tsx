"use client";

import { useState } from "react";
import { Check, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConfirmDeleteButton({ onConfirm, label = "Delete" }: { onConfirm: () => void; label?: string }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center justify-end gap-1">
        <Button
          size="icon-sm"
          variant="destructive"
          aria-label={`Confirm ${label.toLowerCase()}`}
          onClick={() => {
            onConfirm();
            setConfirming(false);
          }}
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Cancel" onClick={() => setConfirming(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button size="icon-sm" variant="ghost" aria-label={label} onClick={() => setConfirming(true)}>
      <Trash2 className="h-4 w-4 text-muted-foreground" />
    </Button>
  );
}
