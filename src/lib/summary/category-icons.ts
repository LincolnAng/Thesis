import { Wheat, Users, Zap, Package, Truck, MoreHorizontal, type LucideIcon } from "lucide-react";
import type { ExpenseCategory } from "@/lib/store/types";

export const CATEGORY_ICONS: Record<ExpenseCategory, LucideIcon> = {
  raw_materials: Wheat,
  labor: Users,
  utilities: Zap,
  packaging: Package,
  transport: Truck,
  misc: MoreHorizontal,
};
