# KoshKit — Personal Finance Calculators

**Live demo:** https://koshkit.vercel.app

# Post-Tax Drag & TDS Compounding Simulator

Most people compare nominal interest rates (e.g. a 7.5% Fixed Deposit vs. a
7.5% debt or arbitrage fund) without accounting for **tax timing**. In an FD,
tax is cut as TDS every period, which shrinks the base available to compound
next period. In a tax-deferred fund, the full pre-tax corpus keeps compounding
until withdrawal. Same rate — different outcomes, purely because of _when_ tax
is paid.

This app makes that divergence visible: enter an amount, rate, horizon, and tax
slab, and it shows the growing gap between the two legs plus the exact rupee
**compounding leakage** lost to early tax cuts.

## What it shows

- **Hero metrics** — compounding leakage (with drag %), net terminal wealth
  (FD leg), realized post-tax XIRR (with bps vs nominal), and the required FD
  hurdle rate to match the deferred fund.
- **Divergence chart** — deferred vs post-TDS growth with the leakage wedge
  shaded; hover any year for an inspection snapshot. Toggle to the
  _Cumulative Tax Drain_ view to compare TDS already paid vs deferred tax still
  compounding.
- **Tax anatomy waterfall** — rupee-for-rupee split of the potential corpus
  into principal, in-pocket gain, exit tax, and timing drag.
- **Audit ledger** — year-by-year (or quarter-by-quarter) table: opening,
  gross accrued, TDS, net reinvested, closing, cumulative drag. Copyable and
  downloadable as CSV.
- **Scenario inputs** — sliders + exact-value fields for principal, nominal
  rate, horizon, and slab (with presets: Nil / 5.2% / 20.8% / 31.2% / 42.7%),
  plus annual vs quarterly compounding/TDS frequency. Everything updates live.
- **Light & dark themes** — Nordic Pine / Obsidian & Champagne, persisted in
  `localStorage`.

## How the math works

Core model lives in `src/lib/finance.ts`:

- Both legs earn the **same nominal rate at the same frequency** (annual or
  quarterly).
- **FD leg:** each period, interest accrues, the slab rate is cut as TDS
  immediately, and only the net is reinvested.
- **Deferred leg:** compounds on the full pre-tax corpus; the same slab rate
  is applied **once at withdrawal** on the total gain.
- The gap between the two outcomes is therefore pure tax timing.
- XIRR is solved client-side on the FD cashflows (Newton–Raphson with a
  bisection fallback).

Default example — ₹10L, 7.5%, 10Y, 31.2% slab, quarterly: FD ≈ ₹16.70L,
deferred net ≈ ₹17.58L, leakage ≈ ₹88.6k, XIRR ≈ 5.26%, hurdle ≈ 8.26%.

> Note: real debt/arbitrage fund taxation depends on holding period and asset
> class. This tool isolates the _timing_ effect of tax, not the tax code.

## Getting started

```bash
npm install
npm run dev      # HMR dev server (usually http://localhost:5173)
npm run build    # tsc -b && vite build (typecheck runs first)
npm run preview  # serve dist/ after build
npm run lint     # eslint .
```

No test / typecheck / format scripts exist.

## Project structure

- Entry: `index.html` → `src/main.tsx` → `src/App.tsx`
- `src/lib/finance.ts` — simulation model, XIRR solver, INR formatting
- `src/assets/` — KoshKit logo set (`logo-light-*` for light backgrounds,
  `logo-dark-*` for dark) and `Design-Scheme.html` (original UI mock)
- `public/` — favicons (`favicon-light.png`, `favicon-dark.png`,
  `apple-touch-icon.png`)
- `tsconfig.json` is project-references only; app config is
  `tsconfig.app.json` (`noUnusedLocals`, `verbatimModuleSyntax` — use
  `import type` for types, `erasableSyntaxOnly` — no enums/namespaces)

## Tech notes

- React 19 + Vite + TypeScript. React Compiler is on via
  `@rolldown/plugin-babel` + `reactCompilerPreset()` in `vite.config.ts` —
  memoization is automatic, no hand-added `useMemo`/`useCallback` for perf.
- Typography (loaded in `index.html`): Newsreader (serif headings), Inter
  (UI), JetBrains Mono (figures).
- Theme switching via `data-theme` on `<html>`; logos swap to match
  (`logo-light-01` on light, `logo-dark-01` on dark), as do the dual
  `prefers-color-scheme` favicons and `theme-color` meta tags.
