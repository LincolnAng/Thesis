export interface LinearTrendResult {
  slope: number;
  points: number[]; // predicted y for each index 0..n-1
  pctPerMonth: number; // slope expressed as % of the series average, signed
}

/** Simple least-squares linear regression over evenly spaced points (index = x). */
export function linearTrend(values: number[]): LinearTrendResult {
  const n = values.length;
  if (n === 0) return { slope: 0, points: [], pctPerMonth: 0 };

  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  const points = values.map((_, i) => intercept + slope * i);
  const pctPerMonth = meanY !== 0 ? (slope / meanY) * 100 : 0;

  return { slope, points, pctPerMonth };
}
