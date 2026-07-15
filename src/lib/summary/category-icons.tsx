import type { CSSProperties } from "react";
import { Wheat, Users, Zap, Package, Truck, MoreHorizontal, Tag, type LucideIcon } from "lucide-react";
import type { ExpenseCategory } from "@/lib/store/types";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  raw_materials: Wheat,
  labor: Users,
  utilities: Zap,
  packaging: Package,
  transport: Truck,
  misc: MoreHorizontal,
};

/** Falls back to a generic tag icon for categories the owner added themselves. */
export function CategoryIcon({
  category,
  className,
  style,
}: {
  category: ExpenseCategory;
  className?: string;
  style?: CSSProperties;
}) {
  const Icon = CATEGORY_ICONS[category] ?? Tag;
  return <Icon className={className} style={style} />;
}
