"use client";

import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store/use-store";
import { categoryBadgeLabel, entryDetailLine, hasAmount, isMoneyIn, type EntryDraft } from "@/lib/home/describe-entry";
import { formatSignedPeso, ENTRY_TYPE_COLORS } from "@/lib/format";
import { cn } from "@/lib/utils";

export function EntryCard({
  draft,
  onEdit,
  onUndo,
}: {
  draft: EntryDraft;
  onEdit: () => void;
  onUndo: () => void;
}) {
  const { products, rawMaterials } = useStore();
  const detail = entryDetailLine(draft, products, rawMaterials);
  const moneyIn = isMoneyIn(draft);

  return (
    <div className="w-full max-w-xs space-y-2 rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <Badge className={cn("border text-xs", ENTRY_TYPE_COLORS[draft.type])} variant="outline">
          {categoryBadgeLabel(draft)}
        </Badge>
        {hasAmount(draft) && draft.amount != null && (
          <span
            className={cn(
              "text-sm font-bold",
              moneyIn ? "text-[var(--status-good)]" : "text-[var(--status-warning)]",
            )}
          >
            {formatSignedPeso(draft.amount, moneyIn)}
          </span>
        )}
      </div>
      <p className="text-sm text-foreground">{detail}</p>
      <div className="flex gap-3 pt-0.5">
        <button onClick={onEdit} className="text-xs font-medium text-muted-foreground underline decoration-dotted">
          Edit
        </button>
        <button onClick={onUndo} className="text-xs font-medium text-muted-foreground underline decoration-dotted">
          Undo
        </button>
      </div>
    </div>
  );
}
