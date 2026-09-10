"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { chipColor } from "@/lib/chart-colors";
import { formatPeso } from "@/lib/format";
import type { ProductCostBreakdown } from "@/lib/summary/recipe-cost";
import { CHART_LEGEND_STYLE, ChartTooltip } from "@/components/summary/chart-theme";

const SLICES: Array<{ label: string; valueOf: (c: ProductCostBreakdown) => number }> = [
  { label: "Ingredients", valueOf: (c) => c.ingredientPerJar },
  { label: "Packaging", valueOf: (c) => c.packagingPerJar },
  { label: "Labor", valueOf: (c) => c.laborPerJar },
  { label: "Other", valueOf: (c) => c.miscPerJar },
];

export function CostBreakdownChart({ cost }: { cost: ProductCostBreakdown }) {
  const data = SLICES.map((s, i) => ({ name: s.label, value: s.valueOf(cost), color: chipColor(i) })).filter(
    (d) => d.value > 0,
  );

  if (data.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground">Cost per jar, by type</p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip formatValue={(v) => formatPeso(Number(v))} />} />
            <Legend wrapperStyle={CHART_LEGEND_STYLE} iconType="circle" iconSize={8} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
