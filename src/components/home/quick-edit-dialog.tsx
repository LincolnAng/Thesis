"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuickEditForm } from "@/components/home/quick-edit-form";
import type { EntryDraft } from "@/lib/home/describe-entry";
import type { EntryType } from "@/lib/store/types";

export function QuickEditDialog({
  open,
  onOpenChange,
  title,
  initial,
  onSave,
  onDelete,
  lockType,
  allowedTypes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial: EntryDraft;
  onSave: (draft: EntryDraft) => void;
  /** Shows a delete button in the form — pass only when editing an entry that already exists. */
  onDelete?: () => void;
  lockType?: boolean;
  allowedTypes?: EntryType[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border border-border ring-0 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <QuickEditForm
          initial={initial}
          lockType={lockType}
          allowedTypes={allowedTypes}
          className="max-w-none border-none bg-transparent p-0"
          onSave={(draft) => {
            onSave(draft);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
          onDelete={
            onDelete
              ? () => {
                  onDelete();
                  onOpenChange(false);
                }
              : undefined
          }
        />
      </DialogContent>
    </Dialog>
  );
}
