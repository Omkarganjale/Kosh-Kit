/* Post-Tax Drag & TDS Compounding Simulator — financial core.
 *
 * Model (documented so future agents don't "fix" it into inconsistency):
 * - Both instruments earn the same nominal annual rate, compounded `periodsPerYear`
 *   times per year (1 = annual, 4 = quarterly, the Indian FD norm).
 * - FD: each period, interest accrues, `taxRate` is cut as TDS immediately, and only
 *   the net interest is reinvested. This is the drag.
 * - Tax-deferred fund: compounds on the full pre-tax corpus; the same `taxRate` is
 *   applied ONCE at withdrawal on the total gain. Same rate + same base = the gap
 *   between the two outcomes is purely the TIMING of tax (compounding leakage).
 * - "Cumulative drag" at any point = exit-today deferred net minus FD balance.
 */

export interface ScenarioInputs {
  /** Initial capital, ₹ */
  principal: number;
  /** Nominal annual rate as a decimal, e.g. 0.075 for 7.5% */
  nominalRate: number;
  /** Horizon in whole years */
  years: number;
  /** Tax rate as a decimal, e.g. 0.312 for 31.2% (30% slab + 4% cess) */
  taxRate: number;
  /** Compounding / TDS frequency per year */
  periodsPerYear: 1 | 4;
}

export interface YearRow {
  year: number;
  opening: number;
  grossAccrued: number;
  tds: number;
  netReinvested: number;
  closing: number;
  /** Deferred-net-if-exited-today minus FD closing */
  cumDrag: number;
  deferredGross: number;
  deferredNet: number;
}

export interface PeriodRow {
  label: string;
  opening: number;
  interest: number;
  tds: number;
  net: number;
  closing: number;
  cumDrag: number;
}

export interface SimResult {
  fdNet: number;
  deferredGross: number;
  deferredNet: number;
  /** Pure timing loss: deferredNet - fdNet (>= 0 when taxRate > 0) */
  leakage: number;
  totalTds: number;
  totalGrossAccrued: number;
  /** Annualised post-tax return of the FD leg */
  fdXirr: number;
  /** Nominal FD rate needed to match the deferred net outcome */
  hurdleRate: number;
  /** Drag in percentage points vs nominal */
  dragBps: number;
  years: YearRow[];
  periods: PeriodRow[];
}

export function clampScenario(s: ScenarioInputs): ScenarioInputs {
  return {
    principal: Math.min(10_00_00_000, Math.max(10_000, s.principal)),
    nominalRate: Math.min(0.15, Math.max(0.01, s.nominalRate)),
    years: Math.min(30, Math.max(1, Math.round(s.years))),
    taxRate: Math.min(0.42744, Math.max(0, s.taxRate)),
    periodsPerYear: s.periodsPerYear === 4 ? 4 : 1,
  };
}

/** Generic XIRR for irregular cashflows. Times are years from first cashflow. */
export function xirr(amounts: number[], times: number[], guess = 0.1): number {
  if (amounts.length !== times.length || amounts.length < 2) return NaN;
  const npv = (r: number) =>
    amounts.reduce((s, a, i) => s + a / Math.pow(1 + r, times[i]), 0);
  // Newton–Raphson
  let r = guess;
  for (let k = 0; k < 100; k++) {
    const f = npv(r);
    const h = 1e-6;
    const d = (npv(r + h) - f) / h;
    if (!isFinite(d) || Math.abs(d) < 1e-12) break;
    const next = r - f / d;
    if (!isFinite(next) || next <= -0.9999) break;
    if (Math.abs(next - r) < 1e-10) return next;
    r = next;
  }
  // Bisection fallback on [-50%, +1000%]
  let lo = -0.5;
  let hi = 10;
  let flo = npv(lo);
  const fhi = npv(hi);
  if (flo * fhi > 0) return NaN;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const f = npv(mid);
    if (Math.abs(f) < 1e-7) return mid;
    if (flo * f <= 0) {
      hi = mid;
    } else {
      lo = mid;
      flo = f;
    }
  }
  return (lo + hi) / 2;
}

export function simulate(raw: ScenarioInputs): SimResult {
  const { principal: P, nominalRate: r, years: n, taxRate: t, periodsPerYear: m } =
    clampScenario(raw);
  const totalPeriods = n * m;
  const perRate = r / m;

  let fd = P;
  let deferred = P;
  let totalTds = 0;
  let totalGrossAccrued = 0;
  let yearInterest = 0;
  let yearCut = 0;

  const years: YearRow[] = [];
  const periods: PeriodRow[] = [];

  for (let p = 1; p <= totalPeriods; p++) {
    // FD leg: accrue, cut TDS, reinvest the net
    const interest = fd * perRate;
    const cut = interest * t;
    fd += interest - cut;
    totalTds += cut;
    totalGrossAccrued += interest;
    yearInterest += interest;
    yearCut += cut;

    deferred *= 1 + perRate;

    // Snapshot helpers (exit-today deferred net at this point)
    const gain = Math.max(0, deferred - P);
    const dragNow = deferred - gain * t - fd;

    if (m === 4) {
      const y = Math.ceil(p / 4);
      const q = (p - 1) % 4;
      // running year aggregates patched below at year end; store per-quarter row
      periods.push({
        label: `Y${y} Q${q + 1}`,
        opening: fd - (interest - cut),
        interest,
        tds: cut,
        net: interest - cut,
        closing: fd,
        cumDrag: dragNow,
      });
    }

    if (p % m === 0) {
      const year = p / m;
      const closing = fd;
      const opening = year === 1 ? P : years[year - 2].closing;
      years.push({
        year,
        opening,
        grossAccrued: yearInterest,
        tds: yearCut,
        netReinvested: closing - opening,
        closing,
        cumDrag: dragNow,
        deferredGross: deferred,
        deferredNet: deferred - Math.max(0, deferred - P) * t,
      });
      yearInterest = 0;
      yearCut = 0;
    }
  }

  if (m === 1) {
    for (const row of years) {
      periods.push({
        label: `Year ${row.year}`,
        opening: row.opening,
        interest: row.grossAccrued,
        tds: row.tds,
        net: row.netReinvested,
        closing: row.closing,
        cumDrag: row.cumDrag,
      });
    }
  }

  const deferredGain = Math.max(0, deferred - P);
  const deferredNet = deferred - deferredGain * t;
  const leakage = Math.max(0, deferredNet - fd);
  const fdXirr = xirr([-P, fd], [0, n]);
  const hurdleRate =
    t >= 1 ? NaN : (m * (Math.pow(deferredNet / P, 1 / totalPeriods) - 1)) / (1 - t);
  const dragBps = (r - (Number.isFinite(fdXirr) ? fdXirr : r * (1 - t))) * 10_000;

  return {
    fdNet: fd,
    deferredGross: deferred,
    deferredNet,
    leakage,
    totalTds,
    totalGrossAccrued,
    fdXirr,
    hurdleRate,
    dragBps,
    years,
    periods,
  };
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export function fmtINR(v: number): string {
  return inr.format(Math.round(v));
}

export function fmtPct(r: number, digits = 2): string {
  return `${(r * 100).toFixed(digits)}%`;
}

export function fmtShortINR(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(2)} Cr`;
  if (a >= 1_00_000) return `₹${(v / 1_00_000).toFixed(2)}L`;
  if (a >= 1_000) return `₹${(v / 1_000).toFixed(1)}k`;
  return fmtINR(v);
}
