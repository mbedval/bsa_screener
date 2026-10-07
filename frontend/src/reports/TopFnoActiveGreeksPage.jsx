import React, { useState, useEffect } from 'react'
import { RefreshCw, Search, Layers, Zap, TrendingUp, HelpCircle, Shield, Award, Activity } from 'lucide-react'

export default function TopFnoActiveGreeksPage({ apiBase, dataset, onNavigate }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  const fetchGreeksData = () => {
    setLoading(true)
    setError('')
    const url = `${apiBase}/fno-active-greeks`
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch Top F&O Active Greeks`)
        return res.json()
      })
      .then(json => {
        setData(json)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchGreeksData()
  }, [apiBase, dataset])

  const filteredRows = (data?.rows || []).filter(row => {
    if (!searchTerm.trim()) return true
    const q = searchTerm.toLowerCase()
    return (
      row.ticker.toLowerCase().includes(q) ||
      (row.stock_name && row.stock_name.toLowerCase().includes(q)) ||
      (row.buildup_signal && row.buildup_signal.toLowerCase().includes(q)) ||
      (row.reversal_timeframe && row.reversal_timeframe.toLowerCase().includes(q))
    );
  })

  return (
    <div className="space-y-6" style={{ paddingBottom: 32 }}>
      {/* Header Banner */}
      <div
        className="panel"
        style={{
          padding: '24px',
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.98))',
          border: '1px solid rgba(126, 200, 240, 0.3)',
          borderRadius: 10
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span className="badge primary" style={{ fontSize: 11, letterSpacing: 1 }}>
                MULTI-FACTOR WINNING PROBABILITY RANKING
              </span>
              {data?.as_of && (
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  Updated: {data.as_of}
                </span>
              )}
            </div>
            <h1 style={{ fontSize: 24, margin: '4px 0 6px 0', color: '#fff', fontWeight: 800 }}>
              🔥 Top 20 High-Probability F&O Active & Greeks Report
            </h1>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: 13, maxWidth: 780 }}>
              Underlyings are dynamically ranked by <b>Multi-Factor Winning Probability (%)</b> combining: <b>(1) Stock Technicals & Delta Skew</b>, <b>(2) Market Sentiment (India VIX)</b>, and <b>(3) Weekly / Monthly / Quarterly Downfall Support Reversals</b>.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* India VIX Card */}
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(217, 119, 6, 0.25))',
                border: '1px solid rgba(245, 158, 11, 0.5)',
                padding: '12px 20px',
                borderRadius: 8,
                textAlign: 'center',
                minWidth: 160
              }}
            >
              <div style={{ fontSize: 11, color: '#fef3c7', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                MARKET INDIA VIX
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#f59e0b', marginTop: 2 }}>
                {data?.market_vix != null ? data.market_vix.toFixed(2) : '13.85'}
              </div>
              <div style={{ fontSize: 10, color: '#fde68a', marginTop: 2, fontWeight: 600 }}>
                {data?.market_vix > 20 ? '⚠️ High Volatility' : '🟢 Normal Volatility Regime'}
              </div>
            </div>

            <button
              className="refresh"
              onClick={fetchGreeksData}
              disabled={loading}
              style={{ padding: '10px 16px', borderRadius: 8 }}
            >
              <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
            </button>
          </div>
        </div>

        {/* Multi-Factor Model Summary Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Activity size={14} /> 1. Technicals & Option Skew
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              Evaluates PCR ratios, Call/Put OI accumulation, and Black-Scholes Delta sensitivity.
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <TrendingUp size={14} /> 2. Market Sentiment (VIX)
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              Adjusts risk-reward expectation based on India VIX volatility environment ({data?.market_vix || 13.85}).
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 11, color: '#52c41a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Shield size={14} /> 3. Support & Downfall Reversal
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              Identifies bounce setups after weekly, monthly, or quarterly pullbacks sitting near key support.
            </div>
          </div>
        </div>
      </div>

      {/* Control Bar: Search & Instructions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ position: 'relative', minWidth: 280 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 11, color: '#64748b' }} />
          <input
            type="text"
            className="search-input"
            placeholder="Filter by ticker, company, support timeframe..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ paddingLeft: 36, width: '100%', borderRadius: 6, fontSize: 13 }}
          />
        </div>

        <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
          <HelpCircle size={14} style={{ color: '#38bdf8' }} />
          <span>Click any <b>Ticker Symbol</b> to open the <b>Best Option Strategy Evaluator</b>.</span>
        </div>
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div className="panel" style={{ padding: '40px 24px', textAlign: 'center', color: '#94a3b8' }}>
          <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px auto', color: '#38bdf8' }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Evaluating Multi-Factor Winning Probabilities for Top F&O Active Underlyings...</div>
        </div>
      )}

      {error && !loading && (
        <div className="panel" style={{ padding: '24px', border: '1px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5' }}>
          <b>Error:</b> {error}
        </div>
      )}

      {/* Data Table */}
      {!loading && !error && data && (
        <div className="panel" style={{ padding: 0, overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 8 }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#09111f', borderBottom: '2px solid rgba(126, 200, 240, 0.2)' }}>
                  <th style={{ padding: '12px 10px', textAlign: 'center', color: '#64748b' }}>#</th>
                  <th style={{ padding: '12px 12px', textAlign: 'left', color: '#38bdf8' }}>TICKER</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', color: '#52c41a' }}>WIN PROBABILITY (%)</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#cbd5e1' }}>SPOT PRICE</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#e2e8f0', fontWeight: 700 }}>ATM STRIKE</th>
                  <th style={{ padding: '12px 12px', textAlign: 'left', color: '#f59e0b' }}>DOWNFALL & SUPPORT REVERSAL</th>
                  <th style={{ padding: '12px 10px', textAlign: 'center', color: '#cbd5e1' }}>PCR & BUILDUP</th>
                  
                  {/* Call Greeks Group */}
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#52c41a', background: 'rgba(82, 196, 26, 0.06)' }}>CE LTP</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#7ec8f0', background: 'rgba(82, 196, 26, 0.06)' }}>CE IV%</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#52c41a', background: 'rgba(82, 196, 26, 0.06)' }}>CE &Delta;</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#94a3b8', background: 'rgba(82, 196, 26, 0.06)' }}>CE &Gamma;</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#ef4444', background: 'rgba(82, 196, 26, 0.06)' }}>CE &Theta;</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#38bdf8', background: 'rgba(82, 196, 26, 0.06)' }}>CE &mathcal;V</th>

                  {/* Put Greeks Group */}
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#f87171', background: 'rgba(239, 68, 68, 0.06)' }}>PE LTP</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#7ec8f0', background: 'rgba(239, 68, 68, 0.06)' }}>PE IV%</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#f87171', background: 'rgba(239, 68, 68, 0.06)' }}>PE &Delta;</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#94a3b8', background: 'rgba(239, 68, 68, 0.06)' }}>PE &Gamma;</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#ef4444', background: 'rgba(239, 68, 68, 0.06)' }}>PE &Theta;</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right', color: '#38bdf8', background: 'rgba(239, 68, 68, 0.06)' }}>PE &mathcal;V</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, idx) => (
                  <tr
                    key={row.ticker}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      background: idx % 2 === 0 ? 'rgba(15, 23, 42, 0.3)' : 'rgba(30, 41, 59, 0.2)',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <td style={{ padding: '10px', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>
                      {row.rank || idx + 1}
                    </td>

                    {/* Ticker & Company */}
                    <td style={{ padding: '10px 12px' }}>
                      <button
                        onClick={() => {
                          if (onNavigate) {
                            onNavigate('best_option_strategy', row.ticker)
                          }
                        }}
                        style={{
                          background: 'rgba(56, 189, 248, 0.12)',
                          color: '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontSize: 12,
                          textAlign: 'left',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          transition: 'all 0.2s ease'
                        }}
                        title={`Click to open Best Option Strategy for ${row.ticker}`}
                      >
                        <span>{row.ticker}</span>
                        <Zap size={12} style={{ color: '#f59e0b' }} />
                      </button>
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                        {row.stock_name}
                      </div>
                    </td>

                    {/* Multi-Factor Win Probability (%) */}
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          padding: '4px 10px',
                          borderRadius: 6,
                          background: row.win_probability >= 85.0 ? 'rgba(82, 196, 26, 0.18)' : 'rgba(245, 158, 11, 0.18)',
                          color: row.win_probability >= 85.0 ? '#52c41a' : '#f59e0b',
                          border: `1px solid ${row.win_probability >= 85.0 ? 'rgba(82, 196, 26, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <Award size={13} /> {row.win_probability?.toFixed(1)}%
                      </span>
                    </td>

                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600, color: '#e2e8f0' }}>
                      ₹{row.spot_price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>
                      ₹{row.atm_strike?.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                    </td>

                    {/* Downfall & Support Reversal Info */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#f87171', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{row.downfall_pct}% Pullback</span>
                        <span style={{ fontSize: 10, color: '#38bdf8', background: 'rgba(56,189,248,0.12)', padding: '1px 6px', borderRadius: 4, border: '1px solid rgba(56,189,248,0.3)' }}>
                          {row.reversal_timeframe}
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                        Supp: <b style={{ color: '#52c41a' }}>₹{row.support_level?.toLocaleString('en-IN', { minimumFractionDigits: 1 })}</b> ({row.dist_to_support_pct}% dist)
                      </div>
                    </td>

                    {/* PCR & Buildup Signal */}
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: row.buildup_signal?.includes('Long') ? 'rgba(82, 196, 26, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                          color: row.buildup_signal?.includes('Long') ? '#52c41a' : '#38bdf8',
                          border: `1px solid ${row.buildup_signal?.includes('Long') ? 'rgba(82, 196, 26, 0.3)' : 'rgba(56, 189, 248, 0.3)'}`
                        }}
                      >
                        {row.buildup_signal}
                      </span>
                      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                        PCR: <b>{row.pcr}</b>
                      </div>
                    </td>

                    {/* CE Values */}
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: '#52c41a', background: 'rgba(82, 196, 26, 0.03)' }}>
                      ₹{row.ce_ltp?.toFixed(2)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#7ec8f0', background: 'rgba(82, 196, 26, 0.03)' }}>
                      {row.ce_iv?.toFixed(1)}%
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: '#52c41a', background: 'rgba(82, 196, 26, 0.03)' }}>
                      {row.ce_delta?.toFixed(2)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#94a3b8', background: 'rgba(82, 196, 26, 0.03)' }}>
                      {row.ce_gamma?.toFixed(4)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#f87171', background: 'rgba(82, 196, 26, 0.03)' }}>
                      {row.ce_theta?.toFixed(2)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#38bdf8', background: 'rgba(82, 196, 26, 0.03)' }}>
                      {row.ce_vega?.toFixed(2)}
                    </td>

                    {/* PE Values */}
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: '#f87171', background: 'rgba(239, 68, 68, 0.03)' }}>
                      ₹{row.pe_ltp?.toFixed(2)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#7ec8f0', background: 'rgba(239, 68, 68, 0.03)' }}>
                      {row.pe_iv?.toFixed(1)}%
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: '#f87171', background: 'rgba(239, 68, 68, 0.03)' }}>
                      {row.pe_delta?.toFixed(2)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#94a3b8', background: 'rgba(239, 68, 68, 0.03)' }}>
                      {row.pe_gamma?.toFixed(4)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#f87171', background: 'rgba(239, 68, 68, 0.03)' }}>
                      {row.pe_theta?.toFixed(2)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#38bdf8', background: 'rgba(239, 68, 68, 0.03)' }}>
                      {row.pe_vega?.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
