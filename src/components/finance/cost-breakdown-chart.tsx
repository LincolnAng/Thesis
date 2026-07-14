"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { chipColor } from "@/lib/chart-colors";
import { formatPeso } from "@/lib/format";
import type { ProductCostBreakdown } from "@/lib/summary/recipe-cost";
import { CHART_LEGEND_STYLE, ChartTooltip } from "@/components/summary/chart-theme";

const SLICES: Array<{ key: keyof ProductCostBreakdown; label: string }> = [
  { key: "ingredientPerJar", label: "Ingredients" },
  { key: "laborPerJar", label: "Labor" },
  { key: "miscPerJar", label: "Other" },
];

export function CostBreakdownChart({ cost }: { cost: ProductCostBreakdown }) {
  const data = SLICES.map((s, i) => ({ name: s.label, value: cost[s.key], color: chipColor(i) })).filter(
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
