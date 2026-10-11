import { useEffect, useState } from 'react'
import logoLight from './assets/logo-light-01-primary-horizontal.png'
import logoDark from './assets/logo-dark-01-primary-horizontal.png'
import './App.css'
import {
  fmtINR,
  fmtPct,
  fmtShortINR,
  simulate,
} from './lib/finance'
import type { ScenarioInputs } from './lib/finance'

type Theme = 'light' | 'dark'
type ChartView = 'wedge' | 'drain'
type LedgerView = 'annual' | 'periods'

const TAX_PRESETS = [
  { label: 'Nil', value: 0 },
  { label: '5.2%', value: 5.2 },
  { label: '20.8%', value: 20.8 },
  { label: '31.2%', value: 31.2 },
  { label: '42.7%', value: 42.744 },
]

const PRINCIPAL_PRESETS = [500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000]

function getStoredTheme(): Theme {
  try {
    return localStorage.getItem('koshkit-theme') === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function SliderInput(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  hint?: string
  onChange: (v: number) => void
}) {
  const { label, value, min, max, step, display, hint, onChange } = props
  return (
    <div className="input-field">
      <div className="input-field-top">
        <label>
          {label}
          <span className="input-value tnum">{display}</span>
        </label>
        <input
          type="number"
          className="input-number tnum"
          aria-label={`${label} (exact value)`}
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!Number.isNaN(v)) onChange(v)
          }}
        />
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      {hint ? <p className="input-hint">{hint}</p> : null}
    </div>
  )
}

function DivergenceChart(props: {
  inputs: ScenarioInputs
  view: ChartView
  hoverYear: number | null
  onHoverYear: (y: number | null) => void
}) {
  const { inputs, view, hoverYear, onHoverYear } = props
  const sim = simulate(inputs)
  const n = sim.years.length

  const W = 900
  const H = 240
  const PAD = { l: 56, r: 12, t: 12, b: 24 }
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b

  const fdSeries = [inputs.principal, ...sim.years.map((y) => y.closing)]
  const deferredSeries = [inputs.principal, ...sim.years.map((y) => y.deferredGross)]
  const tdsCum: number[] = [0]
  const deferredTaxAccrued: number[] = [0]
  let run = 0
  for (const row of sim.years) {
    run += row.tds
    tdsCum.push(run)
    deferredTaxAccrued.push(Math.max(0, row.deferredGross - inputs.principal) * inputs.taxRate)
  }

  const top = view === 'wedge' ? deferredSeries : deferredTaxAccrued
  const bottom = view === 'wedge' ? fdSeries : tdsCum
  const lo = view === 'wedge' ? inputs.principal : 0
  const hi = Math.max(...top, ...bottom, lo + 1)
  const span = hi - lo || 1

  const x = (i: number) => PAD.l + (i / n) * iw
  const y = (v: number) => PAD.t + ih - ((v - lo) / span) * ih

  const line = (s: number[]) => s.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const wedgeFill = `${line(top)} ${[...bottom].reverse().map((v, k) => `L ${x(n - k).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} Z`

  const activeYear = hoverYear ?? n
  const gridVals = [0, 1, 2, 3].map((g) => lo + (span * g) / 3)
  const tickStep = n <= 12 ? 1 : n <= 20 ? 2 : 5

  return (
    <div
      className="svg-container"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const px = ((e.clientX - rect.left) / rect.width) * W
        const idx = Math.round(((px - PAD.l) / iw) * n)
        onHoverYear(Math.min(n, Math.max(0, idx)))
      }}
      onMouseLeave={() => onHoverYear(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Divergence chart">
        {gridVals.map((g, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={y(g)} x2={W - PAD.r} y2={y(g)} className="chart-grid-line" />
            <text x={PAD.l - 8} y={y(g) + 4} textAnchor="end" className="chart-axis-text">
              {fmtShortINR(g)}
            </text>
          </g>
        ))}
        <polygon points={wedgeFill} fill="var(--chart-fill-wedge)" />
        <path d={line(top)} fill="none" stroke="var(--chart-line-gross)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        <path d={line(bottom)} fill="none" stroke="var(--chart-line-net)" strokeWidth="2" strokeDasharray="2 1" vectorEffect="non-scaling-stroke" />
        <line x1={x(activeYear)} y1={PAD.t - 4} x2={x(activeYear)} y2={PAD.t + ih} stroke="var(--border-strong)" strokeWidth="1.5" />
        <circle cx={x(activeYear)} cy={y(top[activeYear])} r="4.5" fill="var(--chart-line-gross)" />
        <circle cx={x(activeYear)} cy={y(bottom[activeYear])} r="4.5" fill="var(--danger)" />
        {Array.from({ length: n + 1 }, (_, i) => i)
          .filter((i) => i % tickStep === 0 || i === n)
          .map((i) => (
            <text
              key={i}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              className="chart-axis-text"
              fontWeight={i === activeYear ? 700 : undefined}
            >
              {i === 0 ? 'Y0' : `Y${i}`}
            </text>
          ))}
      </svg>

      <div className="chart-inspection-card">
        <span className="inspection-title">
          {activeYear === 0 ? 'Starting capital' : `Inspection snapshot (Year ${activeYear})`}
        </span>
        {view === 'wedge' ? (
          <>
            <div className="inspection-row">
              <span style={{ color: 'var(--text-muted)' }}>Deferred value:</span>
              <strong className="tnum" style={{ color: 'var(--text-section)' }}>
                {fmtINR(deferredSeries[activeYear])}
              </strong>
            </div>
            <div className="inspection-row">
              <span style={{ color: 'var(--text-muted)' }}>Post-TDS value:</span>
              <strong className="tnum">{fmtINR(fdSeries[activeYear])}</strong>
            </div>
            <div className="inspection-row" style={{ color: 'var(--danger)', borderTop: '1px dashed var(--border-subtle)', paddingTop: 4 }}>
              <span>Compounding drag:</span>
              <strong className="tnum">
                {activeYear === 0 ? '₹0' : `-${fmtINR(sim.years[activeYear - 1]?.cumDrag ?? 0)}`}
              </strong>
            </div>
          </>
        ) : (
          <>
            <div className="inspection-row">
              <span style={{ color: 'var(--text-muted)' }}>Deferred tax accrued:</span>
              <strong className="tnum" style={{ color: 'var(--text-section)' }}>
                {fmtINR(deferredTaxAccrued[activeYear])}
              </strong>
            </div>
            <div className="inspection-row">
              <span style={{ color: 'var(--text-muted)' }}>TDS already paid:</span>
              <strong className="tnum">{fmtINR(tdsCum[activeYear])}</strong>
            </div>
            <div className="inspection-row" style={{ color: 'var(--danger)', borderTop: '1px dashed var(--border-subtle)', paddingTop: 4 }}>
              <span>Still compounding:</span>
              <strong className="tnum">{fmtINR(deferredTaxAccrued[activeYear] - tdsCum[activeYear])}</strong>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)
  const [principal, setPrincipal] = useState(1_000_000)
  const [ratePct, setRatePct] = useState(7.5)
  const [years, setYears] = useState(10)
  const [taxPct, setTaxPct] = useState(31.2)
  const [periodsPerYear, setPeriodsPerYear] = useState<1 | 4>(4)
  const [chartView, setChartView] = useState<ChartView>('wedge')
  const [ledgerView, setLedgerView] = useState<LedgerView>('annual')
  const [hoverYear, setHoverYear] = useState<number | null>(null)
  const [copyState, setCopyState] = useState('Copy CSV')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem('koshkit-theme', theme)
    } catch {
      /* private mode — theme just won't persist */
    }
  }, [theme])

  const inputs: ScenarioInputs = {
    principal,
    nominalRate: ratePct / 100,
    years: Math.round(years),
    taxRate: taxPct / 100,
    periodsPerYear,
  }
  const sim = simulate(inputs)
  const horizon = sim.years.length

  const fdGain = sim.fdNet - inputs.principal
  const exitTax = sim.deferredGross - sim.deferredNet
  const stackTotal = sim.deferredGross || 1
  const segPrincipal = (inputs.principal / stackTotal) * 100
  const segGain = (Math.max(0, fdGain) / stackTotal) * 100
  const segDrag = (sim.leakage / stackTotal) * 100
  const segExitTax = (Math.max(0, exitTax) / stackTotal) * 100

  const rows = ledgerView === 'annual' ? null : sim.periods

  const toCsv = (): string => {
    const head = 'Period,Opening Balance,Gross Accrued,TDS,Net Reinvested,Closing Balance,Cumulative Drag'
    const lines = sim.years.map((r) =>
      [
        `Year ${r.year}`,
        Math.round(r.opening),
        Math.round(r.grossAccrued),
        Math.round(r.tds),
        Math.round(r.netReinvested),
        Math.round(r.closing),
        Math.round(r.cumDrag),
      ].join(','),
    )
    return [head, ...lines].join('\n')
  }

  const handleCopy = async () => {
    const csv = toCsv()
    try {
      await navigator.clipboard.writeText(csv)
      setCopyState('Copied')
    } catch {
      const ta = document.createElement('textarea')
      ta.value = csv
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopyState('Copied')
    }
    window.setTimeout(() => setCopyState('Copy CSV'), 1600)
  }

  const handleDownload = () => {
    const blob = new Blob([toCsv()], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `koshkit-drag-${Math.round(inputs.principal)}-${ratePct}pct-${horizon}y.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="container">
      <nav className="top-nav">
        <div className="brand-cluster">
          <img
            src={theme === 'dark' ? logoDark : logoLight}
            alt="KoshKit Growth & Drag"
            className="brand-logo"
          />
          <div className="brand-divider" />
          <span className="module-pill">Fixed-Income Drag Engine</span>
        </div>
        <button
          type="button"
          className="toggle-btn"
          onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          aria-pressed={theme === 'dark'}
        >
          <span className="dot" />
          <span>{theme === 'light' ? 'Switch to Obsidian & Champagne' : 'Switch to Nordic Pine'}</span>
        </button>
      </nav>

      <header className="page-header">
        <div>
          <h1 className="page-title">Post-Tax Drag &amp; TDS Compounding Simulator</h1>
          <p className="page-sub">
            Same nominal rate, different tax timing: yearly TDS shrinks the FD base while the
            deferred fund compounds untouched until withdrawal.
          </p>
        </div>
        <div className="meta-tags">
          <span className="badge badge-neutral tnum">Corpus: {fmtShortINR(inputs.principal)}</span>
          <span className="badge badge-neutral tnum">Rate: {fmtPct(inputs.nominalRate)}</span>
          <span className="badge badge-neutral tnum">Slab: {fmtPct(inputs.taxRate, 1)}</span>
        </div>
      </header>

      <section>
        <div className="section-title">Scenario inputs</div>
        <div className="card inputs-panel">
          <SliderInput
            label="Investment amount"
            value={principal}
            min={100_000}
            max={10_000_000}
            step={50_000}
            display={fmtINR(principal)}
            onChange={setPrincipal}
          />
          <div className="chip-row" role="group" aria-label="Principal presets">
            {PRINCIPAL_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={`chip${principal === p ? ' active' : ''}`}
                onClick={() => setPrincipal(p)}
              >
                {fmtShortINR(p)}
              </button>
            ))}
          </div>

          <div className="inputs-grid">
            <SliderInput
              label="Expected rate (nominal)"
              value={ratePct}
              min={1}
              max={12}
              step={0.05}
              display={fmtPct(ratePct / 100)}
              onChange={setRatePct}
            />
            <SliderInput
              label="Time horizon"
              value={years}
              min={1}
              max={30}
              step={1}
              display={`${Math.round(years)} years`}
              onChange={setYears}
            />
            <SliderInput
              label="Tax slab (incl. cess)"
              value={taxPct}
              min={0}
              max={42.744}
              step={0.01}
              display={fmtPct(taxPct / 100, 2)}
              hint="31.2% = 30% slab + 4% cess · 42.74% = with top surcharge"
              onChange={setTaxPct}
            />
            <div className="input-field">
              <div className="input-field-top">
                <label>Compounding &amp; TDS frequency</label>
              </div>
              <div className="pill-switcher" role="group" aria-label="Compounding frequency">
                <button
                  type="button"
                  className={`pill-btn${periodsPerYear === 1 ? ' active' : ''}`}
                  aria-pressed={periodsPerYear === 1}
                  onClick={() => setPeriodsPerYear(1)}
                >
                  Annual
                </button>
                <button
                  type="button"
                  className={`pill-btn${periodsPerYear === 4 ? ' active' : ''}`}
                  aria-pressed={periodsPerYear === 4}
                  onClick={() => setPeriodsPerYear(4)}
                >
                  Quarterly
                </button>
              </div>
              <div className="chip-row" role="group" aria-label="Tax slab presets">
                {TAX_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className={`chip${Math.abs(taxPct - p.value) < 1e-9 ? ' active' : ''}`}
                    onClick={() => setTaxPct(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="section-title">Section 1: Hero metric &amp; executive summary</div>
        <div className="hero-grid">
          <div className="card hero-card primary-highlight">
            <span className="hero-label">Compounding Leakage</span>
            <span className="hero-value tnum negative-num">-{fmtINR(sim.leakage)}</span>
            <div className="hero-footer">
              <span className="badge badge-danger tnum">
                -{(sim.dragBps / 100).toFixed(2)}% drag
              </span>
              <span className="hero-subtext">Pure timing loss</span>
            </div>
          </div>

          <div className="card hero-card wealth-gain">
            <span className="hero-label">Net Terminal Wealth (FD)</span>
            <span className="hero-value tnum">{fmtINR(sim.fdNet)}</span>
            <div className="hero-footer">
              <span className="badge badge-neutral tnum" style={{ color: 'var(--text-section)' }}>
                +{fmtShortINR(fdGain)} gain
              </span>
              <span className="hero-subtext">Post-TDS corpus</span>
            </div>
          </div>

          <div className="card hero-card">
            <span className="hero-label">Realized Post-Tax XIRR</span>
            <span className="hero-value tnum">
              {Number.isFinite(sim.fdXirr) ? fmtPct(sim.fdXirr) : '—'}
            </span>
            <div className="hero-footer">
              <span className="badge badge-neutral tnum">
                -{Math.round((inputs.nominalRate - sim.fdXirr) * 10_000)} bps
              </span>
              <span className="hero-subtext">vs {fmtPct(inputs.nominalRate)} nominal</span>
            </div>
          </div>

          <div className="card hero-card">
            <span className="hero-label">Required FD Hurdle Rate</span>
            <span className="hero-value tnum">
              {Number.isFinite(sim.hurdleRate) ? fmtPct(sim.hurdleRate) : '—'}
            </span>
            <div className="hero-footer">
              <span className="badge badge-neutral tnum">
                +{Math.round((sim.hurdleRate - inputs.nominalRate) * 10_000)} bps spread
              </span>
              <span className="hero-subtext">to match deferred fund</span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="section-title">Section 2: Primary visualization (divergence curve)</div>
        <div className="card chart-panel">
          <div className="chart-header">
            <div className="pill-switcher" role="group" aria-label="Chart view">
              <button
                type="button"
                className={`pill-btn${chartView === 'wedge' ? ' active' : ''}`}
                aria-pressed={chartView === 'wedge'}
                onClick={() => setChartView('wedge')}
              >
                Gross vs. Post-Tax Wedge
              </button>
              <button
                type="button"
                className={`pill-btn${chartView === 'drain' ? ' active' : ''}`}
                aria-pressed={chartView === 'drain'}
                onClick={() => setChartView('drain')}
              >
                Cumulative Tax Drain
              </button>
            </div>
            <div className="chart-legend">
              <div className="legend-item">
                <span className="legend-line" style={{ backgroundColor: 'var(--chart-line-gross)' }} />
                <span>{chartView === 'wedge' ? 'Tax-Deferred Growth (No TDS)' : 'Deferred tax accrued'}</span>
              </div>
              <div className="legend-item">
                <span className="legend-line" style={{ backgroundColor: 'var(--chart-line-net)' }} />
                <span>{chartView === 'wedge' ? 'FD Net Reinvested (Post-TDS)' : 'TDS already paid'}</span>
              </div>
              <div className="legend-item">
                <span className="legend-area" />
                <span style={{ color: 'var(--danger)' }}>Compounding Leakage Wedge</span>
              </div>
            </div>
          </div>

          <DivergenceChart inputs={inputs} view={chartView} hoverYear={hoverYear} onHoverYear={setHoverYear} />
        </div>
      </section>

      <section>
        <div className="section-title">Section 3: Tax anatomy &amp; waterfall breakdown</div>
        <div className="card waterfall-panel">
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 8 }}>
              <span style={{ fontWeight: 700, color: 'var(--text-section)' }}>Rupee-for-rupee distribution matrix</span>
              <span className="tnum" style={{ color: 'var(--text-muted)' }}>
                Total potential corpus: {fmtINR(sim.deferredGross)}
              </span>
            </div>
            <div className="stacked-proportion-track" role="img" aria-label="Distribution of deferred corpus across principal, gain, drag and exit tax">
              <div className="bar-segment seg-principal" style={{ width: `${segPrincipal}%` }} title="Principal capital">
                {segPrincipal > 9 ? `Principal (${segPrincipal.toFixed(1)}%)` : ''}
              </div>
              <div className="bar-segment seg-gain" style={{ width: `${segGain}%` }} title="Net retained gain">
                {segGain > 9 ? `Pure gain (${segGain.toFixed(1)}%)` : ''}
              </div>
              <div className="bar-segment seg-exittax" style={{ width: `${segExitTax}%` }} title="Tax at exit (deferred leg)">
                {segExitTax > 9 ? `Exit tax (${segExitTax.toFixed(1)}%)` : ''}
              </div>
              <div className="bar-segment seg-drag" style={{ width: `${segDrag}%` }} title="Compounding leakage">
                {segDrag > 9 ? `Drag (${segDrag.toFixed(1)}%)` : ''}
              </div>
            </div>
          </div>

          <div className="waterfall-cards-grid">
            <div className="wf-card">
              <div className="wf-header">
                <span className="wf-badge-indicator" style={{ backgroundColor: 'var(--text-muted)' }} />
                <span>1. Base principal</span>
              </div>
              <span className="wf-val tnum">{fmtINR(inputs.principal)}</span>
              <span className="wf-sub">Initial capital deployed</span>
            </div>
            <div className="wf-card">
              <div className="wf-header">
                <span className="wf-badge-indicator" style={{ backgroundColor: 'var(--text-section)' }} />
                <span>2. Net in-pocket gain</span>
              </div>
              <span className="wf-val tnum positive-num">+{fmtINR(fdGain)}</span>
              <span className="wf-sub">Actual profit credited (FD leg)</span>
            </div>
            <div className="wf-card">
              <div className="wf-header">
                <span className="wf-badge-indicator" style={{ backgroundColor: 'var(--text-main)' }} />
                <span>3. Direct TDS remitted</span>
              </div>
              <span className="wf-val tnum">-{fmtINR(sim.totalTds)}</span>
              <span className="wf-sub">Tax paid along the way ({periodsPerYear === 4 ? 'quarterly' : 'yearly'})</span>
            </div>
            <div className="wf-card">
              <div className="wf-header">
                <span className="wf-badge-indicator" style={{ backgroundColor: 'var(--danger)' }} />
                <span>4. Compounding drag</span>
              </div>
              <span className="wf-val tnum negative-num">-{fmtINR(sim.leakage)}</span>
              <span className="wf-sub">Loss from early tax exits</span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="section-title">Section 4: Granular audit ledger</div>
        <div className="card ledger-panel">
          <div className="ledger-top-bar">
            <div className="pill-switcher" role="group" aria-label="Ledger granularity">
              <button
                type="button"
                className={`pill-btn${ledgerView === 'annual' ? ' active' : ''}`}
                aria-pressed={ledgerView === 'annual'}
                onClick={() => setLedgerView('annual')}
              >
                Annual summary (default)
              </button>
              <button
                type="button"
                className={`pill-btn${ledgerView === 'periods' ? ' active' : ''}`}
                aria-pressed={ledgerView === 'periods'}
                onClick={() => setLedgerView('periods')}
              >
                {periodsPerYear === 4 ? `All ${horizon * 4} quarters` : `All ${horizon} years`}
              </button>
            </div>
            <div className="export-actions">
              <button type="button" className="action-btn" onClick={() => void handleCopy()}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                <span>{copyState}</span>
              </button>
              <button type="button" className="action-btn" onClick={handleDownload}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                <span>Download CSV</span>
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th className="text-right">Opening Balance</th>
                  <th className="text-right">Gross Accrued</th>
                  <th className="text-right">TDS ({fmtPct(inputs.taxRate, 1)})</th>
                  <th className="text-right">Net Reinvested</th>
                  <th className="text-right">Closing Balance</th>
                  <th className="text-right">Cumulative Drag</th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? sim.years.map((r) => ({
                  label: `Year ${r.year}`,
                  opening: r.opening,
                  interest: r.grossAccrued,
                  tds: r.tds,
                  net: r.netReinvested,
                  closing: r.closing,
                  cumDrag: r.cumDrag,
                }))).map((r) => (
                  <tr key={r.label}>
                    <td><strong>{r.label}</strong></td>
                    <td className="text-right tnum">{fmtINR(r.opening)}</td>
                    <td className="text-right tnum">{fmtINR(r.interest)}</td>
                    <td className="text-right tnum negative-num">-{fmtINR(r.tds)}</td>
                    <td className="text-right tnum">{fmtINR(r.net)}</td>
                    <td className="text-right tnum">{fmtINR(r.closing)}</td>
                    <td className="text-right tnum negative-num">-{fmtINR(r.cumDrag)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Totals ({horizon}Y)</td>
                  <td className="text-right tnum">{fmtINR(inputs.principal)}</td>
                  <td className="text-right tnum">{fmtINR(sim.totalGrossAccrued)}</td>
                  <td className="text-right tnum negative-num">-{fmtINR(sim.totalTds)}</td>
                  <td className="text-right tnum">{fmtINR(fdGain)}</td>
                  <td className="text-right tnum">{fmtINR(sim.fdNet)}</td>
                  <td className="text-right tnum negative-num">-{fmtINR(sim.leakage)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>

      <footer className="method-note">
        <p>
          <strong>How the math works.</strong> Both legs earn the same nominal rate at the same{' '}
          {periodsPerYear === 4 ? 'quarterly' : 'annual'} frequency. The FD pays {fmtPct(inputs.taxRate, 2)}{' '}
          on interest every period and reinvests the net; the fund compounds untouched and pays the same rate
          once at withdrawal. The gap is therefore pure tax timing. XIRR is solved client-side on the FD cashflows
          (Newton–Raphson with bisection fallback). Real debt/arbitrage fund taxation may differ by holding period —
          this tool isolates the timing effect, not the tax code.
        </p>
      </footer>
    </div>
  )
}
