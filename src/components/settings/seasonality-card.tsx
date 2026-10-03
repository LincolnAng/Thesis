"use client";

import { useState } from "react";
import { CalendarRange, Check, Pencil, RefreshCw, Sparkles, TriangleAlert, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store/use-store";
import {
  clearProductPattern,
  productPattern,
  seasonNotes,
  setProductPattern,
  shelfLifeDays,
} from "@/lib/summary/business-config";
import {
  DRIFT_WARN_THRESHOLD,
  MONTH_LABELS,
  profileDrift,
  type ProductPattern,
} from "@/lib/summary/seasonality";
import { workOutPattern } from "@/lib/summary/work-out-pattern";
import type { Product } from "@/lib/store/types";

/**
 * Which months are busy, per product — worked out rather than asked for.
 *
 * This used to be a dropdown: the owner picked a named pattern for each product. That was
 * backwards. "When is this product busy?" is the question she wants the app to answer, not a
 * fact she already holds and is merely typing in.
 *
 * So the app answers it. Twelve months of her own sales are measured directly; below that the
 * assistant proposes a shape and says why, in words she can disagree with. Editing by hand is
 * still there, but as an override rather than the way in.
 */

const SOURCE_LABEL: Record<ProductPattern["source"], string> = {
  measured: "From your sales",
  suggested: "Worked out by Jamal",
  manual: "You set this",
  legacy: "Old setting",
  none: "Not set",
};

const SOURCE_TONE: Record<ProductPattern["source"], string> = {
  measured: "bg-success/10 text-success",
  suggested: "bg-cacao/10 text-cacao",
  manual: "bg-secondary text-muted-foreground",
  legacy: "bg-secondary text-muted-foreground",
  none: "bg-secondary text-muted-foreground",
};

function MiniBars({ months }: { months: number[] }) {
  const max = Math.max(...months, 1);
  return (
    <div className="flex items-end gap-[3px]" aria-hidden>
      {months.map((m, i) => (
        <span
          key={i}
          title={`${MONTH_LABELS[i]} ${m.toFixed(2)}×`}
          className={`w-[7px] rounded-sm ${m >= 1.15 ? "bg-cacao" : m <= 0.85 ? "bg-line/30" : "bg-cacao/40"}`}
          style={{ height: `${Math.max(4, (m / max) * 26)}px` }}
        />
      ))}
    </div>
  );
}

function ProductRow({
  product,
  busy,
  onWorkOut,
}: {
  product: Product;
  busy: boolean;
  onWorkOut: () => void;
}) {
  const { businessSettings } = useStore();
  const pattern = productPattern(businessSettings, product.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<number[]>(pattern?.months ?? Array(12).fill(1));

  const drift = pattern ? profileDrift(pattern.months) : 0;
  const drifted = Math.abs(drift) > DRIFT_WARN_THRESHOLD;

  function save() {
    setProductPattern(product.id, {
      months: draft.map((v) => (Number.isFinite(v) && v > 0 ? v : 1)),
      source: "manual",
      reason: "You set these by hand.",
      monthsCovered: pattern?.monthsCovered ?? 0,
      updatedAt: new Date().toISOString(),
    });
    setEditing(false);
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{product.name}</span>

        {pattern ? (
          <>
            <MiniBars months={pattern.months} />
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SOURCE_TONE[pattern.source]}`}>
              {SOURCE_LABEL[pattern.source]}
            </span>
          </>
        ) : (
          <span className="text-[12px] text-muted-foreground">Not worked out yet</span>
        )}

        <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" onClick={onWorkOut} disabled={busy}>
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Working…" : pattern ? "Redo" : "Work it out"}
        </Button>
        {pattern && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Edit ${product.name} by hand`}
            onClick={() => {
              setDraft(pattern.months);
              setEditing((v) => !v);
            }}
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        )}
      </div>

      {pattern?.reason && !editing && (
        <p className="text-[12px] leading-relaxed text-muted-foreground">{pattern.reason}</p>
      )}

      {drifted && !editing && (
        <p className="flex items-start gap-1.5 text-[11px] text-[#9A6B12]">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          These average {(1 + drift).toFixed(2)} rather than 1.00, so they describe growth as well as season. The
          forecast would count that twice.
        </p>
      )}

      {editing && (
        <div className="space-y-2 rounded-xl border border-line/15 p-3">
          <div className="grid grid-cols-6 gap-1.5 min-[900px]:grid-cols-12">
            {draft.map((v, i) => (
              <div key={i} className="space-y-0.5">
                <div className="text-center text-[10px] font-semibold text-muted-foreground">{MONTH_LABELS[i]}</div>
                <Input
                  type="number"
                  step="0.05"
                  defaultValue={v}
                  onChange={(e) =>
                    setDraft((d) => d.map((old, j) => (j === i ? Number(e.target.value) || old : old)))
                  }
                  className="h-8 px-1 text-center text-[12px]"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-8 gap-1" onClick={save}>
              <Check className="h-3.5 w-3.5" /> Save
            </Button>
            <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => setEditing(false)}>
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-8 text-xs text-muted-foreground"
              onClick={() => {
                clearProductPattern(product.id);
                setEditing(false);
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function SeasonalityCard() {
  const { businessSettings, products, entries } = useStore();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [allBusy, setAllBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(product: Product) {
    setError(null);
    setBusyId(product.id);
    const result = await workOutPattern(
      product,
      entries,
      products,
      shelfLifeDays(businessSettings, product.id),
      seasonNotes(businessSettings),
    );
    setBusyId(null);
    if (result.error) setError(result.error);
  }

  async function runAll() {
    setError(null);
    setAllBusy(true);
    for (const product of products) {
      setBusyId(product.id);
      const result = await workOutPattern(
        product,
        entries,
        products,
        shelfLifeDays(businessSettings, product.id),
        seasonNotes(businessSettings),
      );
      if (result.error) setError(result.error);
    }
    setBusyId(null);
    setAllBusy(false);
  }

  const unset = products.filter((p) => !productPattern(businessSettings, p.id)).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="h-4 w-4" /> Busy and quiet months
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          You don&apos;t have to know this — the app works it out. Once a product has a year of sales, the pattern comes
          straight from your own figures. Before that, Jamal works out a likely one and tells you why. Change anything
          you disagree with.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" className="gap-1.5" onClick={runAll} disabled={allBusy || products.length === 0}>
            <Sparkles className="h-4 w-4" />
            {allBusy ? "Working through them…" : unset > 0 ? `Work out all ${products.length}` : "Redo all"}
          </Button>
          {unset > 0 && !allBusy && (
            <span className="text-[12px] text-muted-foreground">
              {`${unset} of ${products.length} not worked out yet — until then they're treated as the same all year.`}
            </span>
          )}
        </div>

        {error && (
          <p className="rounded-lg bg-danger/[0.06] px-3 py-2 text-[12px] text-danger">{error}</p>
        )}

        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground">No products yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {products.map((p) => (
              <ProductRow key={p.id} product={p} busy={busyId === p.id} onWorkOut={() => void run(p)} />
            ))}
          </ul>
        )}

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          1.0 is an ordinary month, 1.5 means you sell half as much again, 0.8 a fifth less. The forecast uses these, so
          December stops being predicted from September.
        </p>
      </CardContent>
    </Card>
  );
}
