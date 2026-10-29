"use client";

import { useState } from "react";
import { CalendarRange, Check, Pencil, RefreshCw, Sparkles, TriangleAlert, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store/use-store";
import { isExecutive, useCurrentUser } from "@/lib/auth/current-user";
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
import { fullName } from "@/lib/summary/product-sizes";

/**
 * Which months are busy and quiet, per product — worked out rather than asked for, and said in
 * words (month names) rather than as bars and multipliers.
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
  suggested: "Best guess",
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

/**
 * The pattern in words — "Busiest: Dec, Feb · Quietest: Jun" — rather than twelve unlabelled
 * bars and multipliers she had to decode. A month counts as busy at 15% above an ordinary one.
 */
function BusyQuiet({ months }: { months: number[] }) {
  const pick = (keep: (m: number) => boolean, order: (a: number, b: number) => number) =>
    months
      .map((m, i) => ({ m, i }))
      .filter((x) => keep(x.m))
      .sort((a, b) => order(a.m, b.m))
      .slice(0, 3)
      .map((x) => MONTH_LABELS[x.i]);
  const busiest = pick((m) => m >= 1.15, (a, b) => b - a);
  const quietest = pick((m) => m <= 0.85, (a, b) => a - b);
  if (busiest.length === 0 && quietest.length === 0) {
    return <p className="text-[13px]">About the same all year</p>;
  }
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-0.5 text-[13px]">
      {busiest.length > 0 && (
        <span>
          <span className="font-semibold text-success">Busiest:</span> {busiest.join(", ")}
        </span>
      )}
      {quietest.length > 0 && (
        <span>
          <span className="font-semibold text-danger">Quietest:</span> {quietest.join(", ")}
        </span>
      )}
    </p>
  );
}

function ProductRow({
  product,
  busy,
  onWorkOut,
}: {
  product: Product;
  busy: boolean;
  /** Null for a profile that can't ask the AI (Executives only); editing by hand is everyone's. */
  onWorkOut: (() => void) | null;
}) {
  const { businessSettings, products } = useStore();
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
    <li className="space-y-1 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{fullName(product, products)}</span>

        {pattern && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SOURCE_TONE[pattern.source]}`}>
            {SOURCE_LABEL[pattern.source]}
          </span>
        )}

        {onWorkOut && (
          <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs" onClick={onWorkOut} disabled={busy}>
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Checking…" : pattern ? "Check again" : "Check"}
          </Button>
        )}
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

      {!editing && (pattern ? <BusyQuiet months={pattern.months} /> : <p className="text-[13px] text-muted-foreground">Not checked yet</p>)}

      {pattern?.reason && !editing && (
        <p className="text-[12px] leading-relaxed text-muted-foreground">{pattern.reason}</p>
      )}

      {drifted && !editing && (
        <p className="flex items-start gap-1.5 text-[11px] text-[#9A6B12]">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          The numbers you typed average {(1 + drift).toFixed(2)} instead of 1.0, so the forecast will run high. Lower
          the busy months a little.
        </p>
      )}

      {editing && (
        <div className="space-y-2 rounded-xl border border-line/15 p-3">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            1.0 is an ordinary month, 1.5 means half as much again, 0.8 means a fifth less.
          </p>
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

export function SeasonalityCard({ embedded = false }: { embedded?: boolean } = {}) {
  const { businessSettings, products, entries } = useStore();
  const exec = isExecutive(useCurrentUser());
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

  const body = (
    <>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Which months each product sells more or less than usual. It comes from your sales once a product has a
          year of them; before that it&apos;s a best guess. The monthly forecast above uses this.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {/* Working the pattern out asks the AI, which is an Executive's (see /api/season-pattern). */}
          {exec && (
            <Button size="sm" className="gap-1.5" onClick={runAll} disabled={allBusy || products.length === 0}>
              <Sparkles className="h-4 w-4" />
              {allBusy ? "Checking…" : unset > 0 ? `Check all ${products.length}` : "Optimize AI"}
            </Button>
          )}
          {unset > 0 && !allBusy && (
            <span className="text-[12px] text-muted-foreground">
              {`${unset} of ${products.length} not checked yet — until then they're treated as the same all year.`}
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
              <ProductRow key={p.id} product={p} busy={busyId === p.id} onWorkOut={exec ? () => void run(p) : null} />
            ))}
          </ul>
        )}

    </>
  );

  // On Production it sits under the months it shapes, as part of that card rather than a card
  // of its own.
  if (embedded) {
    return (
      <section className="space-y-4">
        <h3 className="flex items-center gap-2 text-[14.5px] font-semibold">
          <CalendarRange className="h-4 w-4" /> Busy and quiet months
        </h3>
        {body}
      </section>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="h-4 w-4" /> Busy and quiet months
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{body}</CardContent>
    </Card>
  );
}
