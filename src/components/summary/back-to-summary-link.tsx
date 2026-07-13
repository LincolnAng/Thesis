import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function BackToSummaryLink() {
  return (
    <Link href="/summary" className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
      <ChevronLeft className="h-4 w-4" />
      Back to summary
    </Link>
  );
}
