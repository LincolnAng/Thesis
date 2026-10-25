"use client";

import { useEffect, useMemo, useState } from "react";
import { fixedHolidays, type Holiday } from "@/lib/calendar/holidays";

const cache = new Map<number, Holiday[]>();

/** Philippine holidays for the given years — the fixed ones at once, the official list once fetched. */
export function useHolidays(years: number[]): Holiday[] {
  const key = [...new Set(years)].sort().join(",");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    for (const y of key.split(",").map(Number)) {
      if (!y || cache.has(y)) continue;
      fetch(`/api/holidays?year=${y}`)
        .then((r) => r.json())
        .then((j) => {
          if (j?.success && Array.isArray(j.holidays)) cache.set(y, j.holidays);
          if (alive) setTick((t) => t + 1);
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [key]);
  // The same array until something new arrives, so pages that depend on it don't redo work.
  return useMemo(
    () =>
      key
        .split(",")
        .map(Number)
        .filter(Boolean)
        .flatMap((y) => cache.get(y) ?? fixedHolidays(y)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` marks a fetched year landing in the cache
    [key, tick],
  );
}
