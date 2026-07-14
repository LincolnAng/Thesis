import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function BackToSummaryLink() {
  return (
    <Link href="/" className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
      <ChevronLeft className="h-4 w-4" />
      Back to home
    </Link>
  );
}
