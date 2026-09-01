import React, { useEffect, useRef, useState, useMemo, Component } from 'react'
import {
  createChart, ColorType, CrosshairMode,
  CandlestickSeries, HistogramSeries, LineSeries, LineStyle, createSeriesMarkers
} from 'lightweight-charts'
import {
  TrendingUp, BarChart3, Activity, Layers, ArrowUpRight, ArrowDownRight,
  RefreshCw, Search, X, Check, Eye, ChevronRight, Zap, Target, AlertCircle, Calendar
} from 'lucide-react'

// ─── Error Boundary ──────────────────────────────────────────────────────────
export class ChartErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Chart Rendering Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, textAlign: 'center', backgroundColor: '#0f172a', borderRadius: 10, border: '1px solid #ef4444' }}>
          <AlertCircle size={28} style={{ color: '#ef4444', marginBottom: 8 }} />
          <h4 style={{ color: '#f8fafc', margin: '0 0 4px 0' }}>Chart Display Unavailable</h4>
          <p style={{ color: '#94a3b8', fontSize: 12, margin: '0 0 12px 0' }}>
            {this.state.error?.message || 'An error occurred while initializing the chart canvas.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            Retry Chart
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Reusable TradingView Candlestick & Indicator Chart ───────────────────────
export function StockChartVisualizer({ ticker, height = 440, apiBase = '/api/intelligence', highlightedPattern = null, visiblePatterns = null }) {
  const chartContainerRef = useRef(null)
  const chartInstanceRef = useRef(null)
  const [data, setData] = useState(null)
  const [tickerPatterns, setTickerPatterns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [timeframe, setTimeframe] = useState('6M') // '1M', '3M', '6M', '1Y', 'ALL'
  const [showSma20, setShowSma20] = useState(true)
  const [showSma50, setShowSma50] = useState(true)
  const [showBollinger, setShowBollinger] = useState(false)
  const [showProjection, setShowProjection] = useState(true)

  useEffect(() => {
    if (!ticker) return
    setLoading(true)
    setError('')
    
    Promise.all([
      fetch(`${apiBase}/charts/stock/${encodeURIComponent(ticker)}`).then(async r => {
        if (!r.ok) {
          const txt = await r.text()
          throw new Error(`HTTP ${r.status}: ${txt.slice(0, 100)}`)
        }
        return r.json()
      }),
      fetch(`${apiBase}/patterns/ticker/${encodeURIComponent(ticker)}`).then(r => r.ok ? r.json() : { patterns: [] })
    ])
      .then(([chartData, patternData]) => {
        if (!chartData) throw new Error("Failed to fetch chart data")
        setData(chartData)
        setTickerPatterns(patternData?.patterns || [])
        setLoading(false)
      })
      .catch(err => {
        setError(err.message || 'Failed to load chart data.')
        setLoading(false)
      })
  }, [ticker, apiBase])

  // Filter candles based on timeframe
  const filteredCandles = useMemo(() => {
    if (!data?.candles?.length) return []
    const all = data.candles
    if (timeframe === '1D') return all.slice(-5)
    if (timeframe === '1WK') return all.slice(-15)
    if (timeframe === '1M') return all.slice(-22)
    if (timeframe === '3M') return all.slice(-66)
    if (timeframe === '6M') return all.slice(-132)
    if (timeframe === '1Y') return all.slice(-252)
    return all
  }, [data?.candles, timeframe])

  // Render TradingView Chart with v5 API
  useEffect(() => {
    if (!chartContainerRef.current || !filteredCandles.length) return

    // Clean up existing chart
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove()
      chartInstanceRef.current = null
    }

    const container = chartContainerRef.current
    const initWidth = container.clientWidth > 0 ? container.clientWidth : 800

    try {
      const chart = createChart(container, {
        width: initWidth,
        height: height,
        layout: {
          background: { type: ColorType.Solid, color: '#090d16' },
          textColor: '#94a3b8',
          fontSize: 12,
          fontFamily: "'DM Mono', monospace, sans-serif",
        },
        grid: {
          vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
          horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: {
            color: 'rgba(56, 189, 248, 0.5)',
            width: 1,
            style: LineStyle.Dashed,
          },
          horzLine: {
            color: 'rgba(56, 189, 248, 0.5)',
            width: 1,
            style: LineStyle.Dashed,
          },
        },
        rightPriceScale: {
          borderColor: 'rgba(255, 255, 255, 0.1)',
          scaleMargins: {
            top: 0.1,
            bottom: 0.22,
          },
        },
        timeScale: {
          borderColor: 'rgba(255, 255, 255, 0.1)',
          timeVisible: true,
          secondsVisible: false,
        },
      })

      chartInstanceRef.current = chart

      // 1. Candlestick Series (v5 API)
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      })
      candleSeries.setData(filteredCandles)

      // Attach Pattern Markers (filtered by visiblePatterns if provided)
      const candleTimeSet = new Set(filteredCandles.map(c => c.time))
      const markers = []
      let activePatterns = tickerPatterns.filter(p => candleTimeSet.has(p.detected_date))
      if (visiblePatterns && Array.isArray(visiblePatterns)) {
        const visSet = new Set(visiblePatterns.map(c => c.toLowerCase()))
        activePatterns = activePatterns.filter(p => visSet.has(p.pattern_code.toLowerCase()))
      }

      activePatterns.forEach(p => {
        const isHighlight = highlightedPattern && (p.pattern_code === highlightedPattern.pattern_code || p.id === highlightedPattern.id)
        const isBullish = p.category === 'BULLISH'
        const isBearish = p.category === 'BEARISH'
        
        markers.push({
          time: p.detected_date,
          position: isBullish ? 'belowBar' : (isBearish ? 'aboveBar' : 'inBar'),
          color: isHighlight ? '#38bdf8' : (isBullish ? '#22c55e' : (isBearish ? '#ef4444' : '#eab308')),
          shape: isBullish ? 'arrowUp' : (isBearish ? 'arrowDown' : 'circle'),
          text: isHighlight ? `★ ${p.pattern_name.toUpperCase()}` : p.pattern_name,
          size: isHighlight ? 2 : 1,
        })
      })

      if (markers.length) {
        markers.sort((a, b) => a.time.localeCompare(b.time))
        try {
          if (typeof candleSeries.setMarkers === 'function') {
            candleSeries.setMarkers(markers)
          } else if (typeof createSeriesMarkers === 'function') {
            createSeriesMarkers(candleSeries, markers)
          }
        } catch (mErr) {
          console.warn('Marker attach warning:', mErr)
        }
      }

      // Highlighted Pattern Price Band Lines
      if (highlightedPattern && candleTimeSet.has(highlightedPattern.detected_date)) {
        if (highlightedPattern.high_price != null) {
          candleSeries.createPriceLine({
            price: Number(highlightedPattern.high_price),
            color: 'rgba(56, 189, 248, 0.9)',
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: `[PATTERN HIGH] ${highlightedPattern.pattern_name}`,
          })
        }
        if (highlightedPattern.low_price != null) {
          candleSeries.createPriceLine({
            price: Number(highlightedPattern.low_price),
            color: 'rgba(56, 189, 248, 0.9)',
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: `[PATTERN LOW] ${highlightedPattern.pattern_name}`,
          })
        }
      }

      // 2. Volume Histogram Overlay
      if (data?.volume?.length) {
        const volumeSeries = chart.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
        })
        chart.priceScale('volume').applyOptions({
          scaleMargins: { top: 0.82, bottom: 0 },
        })
        const volMap = new Set(filteredCandles.map(c => c.time))
        volumeSeries.setData(data.volume.filter(v => volMap.has(v.time)))
      }

      // 3. SMA 20 Overlay
      if (showSma20 && data?.sma20?.length) {
        const sma20Series = chart.addSeries(LineSeries, {
          color: '#f59e0b',
          lineWidth: 2,
          title: 'SMA 20',
        })
        const timeMap = new Set(filteredCandles.map(c => c.time))
        sma20Series.setData(data.sma20.filter(s => timeMap.has(s.time)))
      }

      // 4. SMA 50 Overlay
      if (showSma50 && data?.sma50?.length) {
        const sma50Series = chart.addSeries(LineSeries, {
          color: '#06b6d4',
          lineWidth: 2,
          title: 'SMA 50',
        })
        const timeMap = new Set(filteredCandles.map(c => c.time))
        sma50Series.setData(data.sma50.filter(s => timeMap.has(s.time)))
      }

      // 5. Bollinger Bands Overlay
      if (showBollinger && data?.bb_upper?.length && data?.bb_lower?.length) {
        const timeMap = new Set(filteredCandles.map(c => c.time))
        const bbUp = chart.addSeries(LineSeries, {
          color: 'rgba(168, 85, 247, 0.7)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          title: 'BB Upper',
        })
        bbUp.setData(data.bb_upper.filter(s => timeMap.has(s.time)))

        const bbLow = chart.addSeries(LineSeries, {
          color: 'rgba(168, 85, 247, 0.7)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          title: 'BB Lower',
        })
        bbLow.setData(data.bb_lower.filter(s => timeMap.has(s.time)))
      }

      // 6. 22-Day Forward Trajectory Projection Line
      if (showProjection && data?.projection_22d?.length && filteredCandles.length) {
        const lastCandle = filteredCandles[filteredCandles.length - 1]
        const lastDate = new Date(lastCandle.time)
        const projPoints = [{ time: lastCandle.time, value: lastCandle.close }]

        data.projection_22d.forEach((price, idx) => {
          const nextDate = new Date(lastDate)
          let added = 0
          while (added < idx + 1) {
            nextDate.setDate(nextDate.getDate() + 1)
            if (nextDate.getDay() !== 0 && nextDate.getDay() !== 6) {
              added++
            }
          }
          const yyyy = nextDate.getFullYear()
          const mm = String(nextDate.getMonth() + 1).padStart(2, '0')
          const dd = String(nextDate.getDate()).padStart(2, '0')
          projPoints.push({
            time: `${yyyy}-${mm}-${dd}`,
            value: price,
          })
        })

        const projSeries = chart.addSeries(LineSeries, {
          color: '#38bdf8',
          lineWidth: 2,
          lineStyle: LineStyle.Dotted,
          title: '22D Target',
        })
        projSeries.setData(projPoints)
      }

      chart.timeScale().fitContent()

      const handleResize = () => {
        if (chartContainerRef.current && chartInstanceRef.current) {
          const w = chartContainerRef.current.clientWidth
          if (w > 0) {
            chartInstanceRef.current.applyOptions({ width: w })
          }
        }
      }

      window.addEventListener('resize', handleResize)
      return () => {
        window.removeEventListener('resize', handleResize)
        if (chartInstanceRef.current) {
          chartInstanceRef.current.remove()
          chartInstanceRef.current = null
        }
      }
    } catch (err) {
      console.error('Error creating TradingView chart:', err)
      setError(`Chart Initialization Error: ${err.message}`)
    }
  }, [filteredCandles, showSma20, showSma50, showBollinger, showProjection, height])

  const latestCandle = filteredCandles[filteredCandles.length - 1]
  const prevCandle = filteredCandles[filteredCandles.length - 2]
  const dayChange = latestCandle && prevCandle ? latestCandle.close - prevCandle.close : 0
  const dayChangePct = latestCandle && prevCandle ? (dayChange / prevCandle.close) * 100 : 0
  const isUp = dayChange >= 0

  const latestRsi = data?.rsi?.length ? data.rsi[data.rsi.length - 1]?.value : null
  const latestMacd = data?.macd?.length ? data.macd[data.macd.length - 1] : null

  return (
    <div style={{ backgroundColor: '#0f172a', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', backgroundColor: '#090d16', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc', fontFamily: "'DM Mono'" }}>{ticker}</span>
              <span style={{ fontSize: 13, color: '#94a3b8' }}>{data?.company_name || ticker}</span>
              {data?.sector && (
                <span style={{ fontSize: 11, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                  {data.sector}
                </span>
              )}
            </div>
            {latestCandle && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 3 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#f8fafc', fontFamily: "'DM Mono'" }}>
                  ₹{latestCandle.close.toFixed(2)}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: isUp ? '#22c55e' : '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  {isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {isUp ? '+' : ''}{dayChange.toFixed(2)} ({isUp ? '+' : ''}{dayChangePct.toFixed(2)}%)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* View mode and indicator toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Timeframe selector */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: 2 }}>
            {['1D', '1WK', '1M', '3M', '6M', '1Y', 'ALL'].map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                style={{
                  background: timeframe === tf ? '#38bdf8' : 'transparent',
                  color: timeframe === tf ? '#0f172a' : '#94a3b8',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all .15s ease',
                }}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Indicator toggles */}
          <button
            onClick={() => setShowSma20(!showSma20)}
            style={{
              background: showSma20 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${showSma20 ? '#f59e0b' : 'rgba(255,255,255,0.1)'}`,
              color: showSma20 ? '#fbbf24' : '#64748b',
              padding: '4px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            SMA 20
          </button>

          <button
            onClick={() => setShowSma50(!showSma50)}
            style={{
              background: showSma50 ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${showSma50 ? '#06b6d4' : 'rgba(255,255,255,0.1)'}`,
              color: showSma50 ? '#22d3ee' : '#64748b',
              padding: '4px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            SMA 50
          </button>

          <button
            onClick={() => setShowBollinger(!showBollinger)}
            style={{
              background: showBollinger ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${showBollinger ? '#a855f7' : 'rgba(255,255,255,0.1)'}`,
              color: showBollinger ? '#c084fc' : '#64748b',
              padding: '4px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Bollinger Bands
          </button>

          <button
            onClick={() => setShowProjection(!showProjection)}
            style={{
              background: showProjection ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${showProjection ? '#38bdf8' : 'rgba(255,255,255,0.1)'}`,
              color: showProjection ? '#38bdf8' : '#64748b',
              padding: '4px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            22D Forecast Cone
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: height, gap: 12 }}>
          <RefreshCw size={24} className="spin-icon" style={{ color: '#38bdf8' }} />
          <span style={{ fontSize: 13, color: '#94a3b8' }}>Loading interactive candlestick and indicator series…</span>
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: height, color: '#ef4444', padding: 20, textAlign: 'center' }}>
          {error}
        </div>
      )}

      {/* Main TradingView Canvas */}
      {!loading && !error && (
        <div>
          <div ref={chartContainerRef} style={{ width: '100%', height: height, minHeight: height }} />

          {/* Secondary Oscillators & Indicator Dashboard */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, padding: '14px 18px', backgroundColor: '#090d16', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            {/* RSI-14 Indicator Bar */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>RSI (14) Momentum</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: latestRsi > 70 ? '#ef4444' : latestRsi < 30 ? '#22c55e' : '#38bdf8' }}>
                  {latestRsi ? latestRsi.toFixed(1) : '—'}
                </span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                {latestRsi && (
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, latestRsi))}%`,
                      height: '100%',
                      background: latestRsi > 70 ? '#ef4444' : latestRsi < 30 ? '#22c55e' : '#38bdf8',
                      borderRadius: 3,
                    }}
                  />
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b', marginTop: 3 }}>
                <span>Oversold (30)</span>
                <span>Neutral (50)</span>
                <span>Overbought (70)</span>
              </div>
            </div>

            {/* MACD Status */}
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>MACD (12, 26, 9)</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: latestMacd?.hist >= 0 ? '#22c55e' : '#ef4444' }}>
                  {latestMacd ? (latestMacd.hist >= 0 ? 'Bullish Divergence' : 'Bearish Divergence') : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>
                <span>MACD: <b>{latestMacd?.macd?.toFixed(2) ?? '—'}</b></span>
                <span>Signal: <b>{latestMacd?.signal?.toFixed(2) ?? '—'}</b></span>
                <span>Hist: <b style={{ color: latestMacd?.hist >= 0 ? '#22c55e' : '#ef4444' }}>{latestMacd?.hist?.toFixed(2) ?? '—'}</b></span>
              </div>
            </div>

            {/* Hybrid Confluence Score */}
            {data?.summary?.hybrid_score !== undefined && (
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Algorithmic Confluence</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8' }}>
                    Score: {data.summary.hybrid_score}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#cbd5e1', marginTop: 4 }}>
                  <span>Tech: <b>{data.summary.technical_score ?? '—'}</b></span>
                  <span>Fund: <b>{data.summary.fundamental_score ?? '—'}</b></span>
                  <span>Behav: <b>{data.summary.behavioral_score ?? '—'}</b></span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Stock Chart Visualizer Modal Popover ─────────────────────────────────────
export function StockVisualizerModal({ ticker, onClose, dataset = 'intelligence' }) {
  if (!ticker) return null
  const apiBase = dataset === 'us_intelligence' ? '/api/us_intelligence' : '/api/intelligence'

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(3, 7, 18, 0.88)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: 16,
      }}
    >
      <div
        className="modal-card"
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(1280px, 96vw)',
          maxHeight: '94vh',
          backgroundColor: '#090d16',
          borderRadius: 14,
          border: '1px solid rgba(56, 189, 248, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            backgroundColor: '#0f172a',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: 'rgba(56, 189, 248, 0.15)', padding: 6, borderRadius: 8, display: 'flex', alignItems: 'center' }}>
              <TrendingUp size={18} style={{ color: '#38bdf8' }} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>
              Technical Chart & Volatility Studio: <span style={{ color: '#38bdf8', fontFamily: "'DM Mono'" }}>{ticker}</span>
            </span>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: 16, overflowY: 'auto' }}>
          <ChartErrorBoundary>
            <StockChartVisualizer ticker={ticker} height={460} apiBase={apiBase} />
          </ChartErrorBoundary>
        </div>
      </div>
    </div>
  )
}

// ─── Sector Market Breadth Heatmap Visualizer ──────────────────────────────────
export function SectorHeatmapVisualizer({ onSelectSector, apiBase = '/api/intelligence' }) {
  const [sectors, setSectors] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${apiBase}/charts/sector-overview`)
      .then(r => r.json())
      .then(d => {
        setSectors(d.sectors || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [apiBase])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, color: '#94a3b8' }}>
        <RefreshCw size={20} className="spin-icon" style={{ marginRight: 8, color: '#38bdf8' }} />
        Calculating market sector breadth…
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
      {sectors.map(sec => {
        const total = sec.stock_count || 1
        const bullPct = ((sec.bullish_count || 0) / total) * 100
        const bearPct = ((sec.bearish_count || 0) / total) * 100
        const isBullish = (sec.avg_score || 0) >= 0

        return (
          <div
            key={sec.sector}
            onClick={() => onSelectSector && onSelectSector(sec.sector)}
            style={{
              background: 'linear-gradient(145deg, #0f172a, #1e293b)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding: 16,
              cursor: 'pointer',
              transition: 'all .2s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(56, 189, 248, 0.4)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>{sec.sector}</h3>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{sec.stock_count} Tracked Stocks</span>
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: isBullish ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: isBullish ? '#22c55e' : '#ef4444',
                }}
              >
                Avg {sec.avg_score >= 0 ? '+' : ''}{sec.avg_score}
              </span>
            </div>

            {/* Breadth Bar */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'rgba(255,255,255,0.1)' }}>
                <div style={{ width: `${bullPct}%`, background: '#22c55e' }} title={`Bullish: ${sec.bullish_count}`} />
                <div style={{ width: `${100 - bullPct - bearPct}%`, background: '#64748b' }} title={`Neutral: ${sec.neutral_count}`} />
                <div style={{ width: `${bearPct}%`, background: '#ef4444' }} title={`Bearish: ${sec.bearish_count}`} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#cbd5e1' }}>
              <span style={{ color: '#22c55e', fontWeight: 600 }}>🟢 {sec.bullish_count} Bullish</span>
              <span style={{ color: '#94a3b8' }}>⚪ {sec.neutral_count} Neutral</span>
              <span style={{ color: '#ef4444', fontWeight: 600 }}>🔴 {sec.bearish_count} Bearish</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Dedicated Visualization Hub Page ─────────────────────────────────────────
export function ChartsVisualizationsPage({ onSelectStock, apiBase = '/api/intelligence', dataset = 'intelligence' }) {
  const isUS = dataset === 'us_intelligence'
  const defaultTicker = isUS ? 'AAPL' : 'BEL'
  const [selectedTicker, setSelectedTicker] = useState(defaultTicker)
  const [searchInput, setSearchInput] = useState('')
  const [activeSubTab, setActiveSubTab] = useState('stock_chart') // 'stock_chart', 'sector_breadth'

  useEffect(() => {
    setSelectedTicker(isUS ? 'AAPL' : 'BEL')
  }, [dataset, isUS])

  // Dynamic search history from localStorage per market
  const storageKey = isUS ? 'bsa_us_search_history' : 'bsa_search_history'
  const [searchHistory, setSearchHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]') } catch (_) { return [] }
  })

  useEffect(() => {
    try { setSearchHistory(JSON.parse(localStorage.getItem(storageKey) || '[]')) } catch (_) { setSearchHistory([]) }
  }, [storageKey])

  const addSearchHistory = (term) => {
    if (!term || typeof term !== 'string') return
    const clean = term.trim().toUpperCase()
    if (!clean || clean.length < 2) return
    setSearchHistory(prev => {
      const filtered = prev.filter(item => item !== clean)
      const updated = [clean, ...filtered].slice(0, 10)
      try { localStorage.setItem(storageKey, JSON.stringify(updated)) } catch (_) {}
      return updated
    })
  }

  const defaultPopular = isUS
    ? ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AMD', 'JPM', 'SPY', 'QQQ']
    : ['BEL', 'RELIANCE', 'HDFCBANK', 'INFY', 'TCS', 'HAL', 'CANBK', 'PAYTM', 'PARADEEP', 'VARROC']

  // Combined list prioritizing search history followed by default popular tickers
  const popularTickers = Array.from(new Set([...searchHistory, ...defaultPopular])).slice(0, 12)

  const handleSearchSubmit = () => {
    if (searchInput.trim()) {
      const t = searchInput.trim().toUpperCase()
      addSearchHistory(t)
      setSelectedTicker(t)
      setSearchInput('')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc', margin: '0 0 4px 0' }}>
            Data Visualization & Technical Charting Studio
          </h2>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
            Interactive TradingView charts, technical indicator overlays, 22-day projection cones, and sector market breadth heatmaps.
          </p>
        </div>

        {/* Tab switch */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 3, gap: 4 }}>
          <button
            onClick={() => setActiveSubTab('stock_chart')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: activeSubTab === 'stock_chart' ? '#38bdf8' : 'transparent',
              color: activeSubTab === 'stock_chart' ? '#0f172a' : '#cbd5e1',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <TrendingUp size={15} />
            Stock Candlestick Studio
          </button>

          <button
            onClick={() => setActiveSubTab('sector_breadth')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: activeSubTab === 'sector_breadth' ? '#38bdf8' : 'transparent',
              color: activeSubTab === 'sector_breadth' ? '#0f172a' : '#cbd5e1',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <BarChart3 size={15} />
            Sector Breadth Heatmap
          </button>
        </div>
      </div>

      {activeSubTab === 'stock_chart' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Ticker Search and Quick Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#0f172a', padding: '12px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}>
              <Search size={15} style={{ color: '#7ec8f0' }} />
              <input
                type="text"
                placeholder={isUS ? "Search symbol (e.g. AAPL, NVDA)..." : "Search symbol (e.g. RELIANCE, BEL)..."}
                value={searchInput}
                onChange={e => setSearchInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleSearchSubmit()}
                style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 13, outline: 'none', width: 230 }}
              />
              <button
                onClick={handleSearchSubmit}
                style={{ background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >
                View
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Quick Tickers:</span>
              {popularTickers.map(t => (
                <button
                  key={t}
                  onClick={() => setSelectedTicker(t)}
                  style={{
                    background: selectedTicker === t ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${selectedTicker === t ? '#38bdf8' : 'rgba(255,255,255,0.1)'}`,
                    color: selectedTicker === t ? '#38bdf8' : '#cbd5e1',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 12,
                    fontFamily: "'DM Mono'",
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Chart Component with Error Boundary */}
          <ChartErrorBoundary>
            <StockChartVisualizer ticker={selectedTicker} height={480} apiBase={apiBase} />
          </ChartErrorBoundary>
        </div>
      ) : (
        <SectorHeatmapVisualizer apiBase={apiBase} />
      )}
    </div>
  )
}

// ─── Research Board — Period Comparison Page ──────────────────────────────────
function OverlapChart({ series1, series2, label1, label2, height = 400 }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }
    const chart = createChart(container, {
      width: container.clientWidth || 900, height,
      layout: { background: { type: ColorType.Solid, color: '#0d1117' }, textColor: '#c9d1d9' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.06)' }, horzLines: { color: 'rgba(255,255,255,0.06)' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.12)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.12)', timeVisible: false },
    })
    chartRef.current = chart
    if (series1.length > 0) {
      const s1 = chart.addSeries(LineSeries, { color: '#38bdf8', lineWidth: 2, title: label1, priceLineVisible: false })
      s1.setData(series1.map((d, i) => ({ time: i + 1, value: d.normalised ?? 100 })))
    }
    if (series2.length > 0) {
      const s2 = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 2, title: label2, priceLineVisible: false })
      s2.setData(series2.map((d, i) => ({ time: i + 1, value: d.normalised ?? 100 })))
    }
    chart.timeScale().fitContent()
    const ro = new ResizeObserver(() => { if (chartRef.current && container) chartRef.current.applyOptions({ width: container.clientWidth }) })
    ro.observe(container)
    return () => { ro.disconnect(); if (chartRef.current) { chartRef.current.remove(); chartRef.current = null } }
  }, [series1, series2, label1, label2, height])
  return <div ref={containerRef} style={{ width: '100%', borderRadius: 8, overflow: 'hidden' }} />
}

function AbsolutePriceChart({ series1, series2, label1, label2, height = 400 }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null }
    const chart = createChart(container, {
      width: container.clientWidth || 900, height,
      layout: { background: { type: ColorType.Solid, color: '#0d1117' }, textColor: '#c9d1d9' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.06)' }, horzLines: { color: 'rgba(255,255,255,0.06)' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.12)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.12)', timeVisible: false },
    })
    chartRef.current = chart
    if (series1.length > 0) {
      const s1 = chart.addSeries(LineSeries, { color: '#38bdf8', lineWidth: 2, title: label1, priceLineVisible: false })
      s1.setData(series1.map((d, i) => ({ time: i + 1, value: d.close })))
    }
    chart.timeScale().fitContent()
    const ro = new ResizeObserver(() => { if (chartRef.current && container) chartRef.current.applyOptions({ width: container.clientWidth }) })
    ro.observe(container)
    return () => { ro.disconnect(); if (chartRef.current) { chartRef.current.remove(); chartRef.current = null } }
  }, [series1, series2, label1, label2, height])
  return <div ref={containerRef} style={{ width: '100%', borderRadius: 8, overflow: 'hidden' }} />
}

function researchStats(series) {
  if (!series || series.length === 0) return null
  const closes = series.map(d => d.close)
  const first = closes[0], last = closes[closes.length - 1]
  const pct = first > 0 ? (((last - first) / first) * 100).toFixed(2) : '0'
  return { first: first.toFixed(2), last: last.toFixed(2), pct, high: Math.max(...closes).toFixed(2), low: Math.min(...closes).toFixed(2), days: series.length }
}

const STATIC_PATTERNS = [
  // Neutral Patterns
  { code: 'standard_doji', name: 'Standard Doji', category: 'NEUTRAL', description: 'Open and close are virtually equal with small shadows.' },
  { code: 'spinning_top', name: 'Spinning Top', category: 'NEUTRAL', description: 'Small real body with long upper and lower shadows of similar length.' },
  { code: 'long_legged_doji', name: 'Long-Legged Doji', category: 'NEUTRAL', description: 'Doji with extremely long upper and lower shadows indicating high indecision.' },

  // Bullish Patterns
  { code: 'three_white_soldiers', name: 'Three White Soldiers', category: 'BULLISH', description: 'Three consecutive long green candles closing progressively higher.' },
  { code: 'morning_star', name: 'Morning Star', category: 'BULLISH', description: 'Long red candle followed by a small star and a strong green candle piercing upward.' },
  { code: 'bullish_engulfing', name: 'Bullish Engulfing', category: 'BULLISH', description: 'Green candle completely engulfs the prior small red candle body.' },
  { code: 'inverted_hammer', name: 'Inverted Hammer', category: 'BULLISH', description: 'Small body at bottom with long upper shadow after a downtrend.' },
  { code: 'hammer', name: 'Hammer', category: 'BULLISH', description: 'Small body at top with long lower shadow after a downtrend.' },
  { code: 'piercing_line', name: 'Piercing Line', category: 'BULLISH', description: 'Long red candle followed by a green candle closing above its 50% midpoint.' },

  // Bearish Patterns
  { code: 'three_black_crows', name: 'Three Black Crows', category: 'BEARISH', description: 'Three consecutive long red candles closing progressively lower.' },
  { code: 'evening_star', name: 'Evening Star', category: 'BEARISH', description: 'Long green candle followed by a small star and a strong red candle piercing downward.' },
  { code: 'bearish_engulfing', name: 'Bearish Engulfing', category: 'BEARISH', description: 'Red candle completely engulfs the prior small green candle body.' },
  { code: 'shooting_star', name: 'Shooting Star', category: 'BEARISH', description: 'Small body at bottom with long upper shadow after an uptrend.' },
  { code: 'dark_cloud_cover', name: 'Dark Cloud Cover', category: 'BEARISH', description: 'Long green candle followed by a red candle closing below its 50% midpoint.' },
  { code: 'gravestone_doji', name: 'Gravestone Doji', category: 'BEARISH', description: 'Doji with long upper shadow and virtually no lower shadow at peak.' },
]

// ─── Pattern Viewer Sub-Component ─────────────────────────────────────────────
export function PatternViewerTab({ apiBase = '/api/intelligence', dataset = 'intelligence', fnoOnly = false, indicesOnly = false }) {
  const isUS = dataset === 'us_intelligence'
  const [catalog, setCatalog] = useState(STATIC_PATTERNS)
  const [selectedPatterns, setSelectedPatterns] = useState(['bullish_engulfing'])
  const [timeframe, setTimeframe] = useState('DAILY')
  const [patternData, setPatternData] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedRow, setSelectedRow] = useState(null)
  const [search, setSearch] = useState('')

  // Load catalog
  useEffect(() => {
    fetch(`${apiBase}/patterns/catalog?fno_only=${fnoOnly}&indices_only=${indicesOnly}`)
      .then(r => r.json())
      .then(d => {
        if (d.catalog && d.catalog.length) setCatalog(d.catalog)
      })
      .catch(() => {})
  }, [apiBase, fnoOnly, indicesOnly])

  // Toggle pattern checkbox selection
  const togglePattern = (code) => {
    setSelectedPatterns(prev => {
      if (prev.includes(code)) {
        if (prev.length === 1) return prev // Keep at least one pattern selected
        return prev.filter(c => c !== code)
      } else {
        return [...prev, code]
      }
    })
  }

  // Load matching pattern occurrences for all selected pattern checkboxes
  useEffect(() => {
    if (!selectedPatterns.length) return
    setLoading(true)
    const codesParam = selectedPatterns.join(',')
    fetch(`${apiBase}/patterns/list?pattern_code=${encodeURIComponent(codesParam)}&timeframe=${encodeURIComponent(timeframe)}&fno_only=${fnoOnly}&indices_only=${indicesOnly}&limit=200`)
      .then(r => r.json())
      .then(d => {
        setPatternData(d.rows || [])
        setLoading(false)
        if (d.rows?.length) {
          setSelectedRow(d.rows[0])
        } else {
          setSelectedRow(null)
        }
      })
      .catch(() => setLoading(false))
  }, [selectedPatterns, timeframe, apiBase, fnoOnly, indicesOnly])

  const filteredRows = useMemo(() => {
    if (!search.trim()) return patternData
    const q = search.toLowerCase()
    return patternData.filter(r => r.ticker.toLowerCase().includes(q) || (r.company_name || '').toLowerCase().includes(q) || (r.sector || '').toLowerCase().includes(q) || (r.pattern_name || '').toLowerCase().includes(q))
  }, [patternData, search])

  const activePatternMeta = useMemo(() => {
    if (selectedRow) {
      return catalog.find(p => p.code === selectedRow.pattern_code) || { name: selectedRow.pattern_name, category: selectedRow.category || 'BULLISH', description: '' }
    }
    const firstCode = selectedPatterns[0]
    return catalog.find(p => p.code === firstCode) || { name: firstCode, category: 'BULLISH', description: '' }
  }, [catalog, selectedRow, selectedPatterns])

  const neutralList = catalog.filter(p => p.category === 'NEUTRAL')
  const bullishList = catalog.filter(p => p.category === 'BULLISH')
  const bearishList = catalog.filter(p => p.category === 'BEARISH')

  const cardStyle = { background: '#161b22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
              ☑️ Select Patterns ({selectedPatterns.length} Active Filters):
            </span>
            <button
              onClick={() => setSelectedPatterns(catalog.map(p => p.code))}
              style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
            >
              Select All (15)
            </button>
            <button
              onClick={() => setSelectedPatterns(['bullish_engulfing'])}
              style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              Reset Default
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', padding: 3, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
            <button
              onClick={() => setTimeframe('DAILY')}
              style={{
                background: timeframe === 'DAILY' ? '#38bdf8' : 'transparent',
                color: timeframe === 'DAILY' ? '#0f172a' : '#cbd5e1',
                border: 'none',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              📅 Daily Chart (1D)
            </button>
            <button
              onClick={() => setTimeframe('WEEKLY')}
              style={{
                background: timeframe === 'WEEKLY' ? '#38bdf8' : 'transparent',
                color: timeframe === 'WEEKLY' ? '#0f172a' : '#cbd5e1',
                border: 'none',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              📊 Weekly Chart (1WK)
            </button>
          </div>
        </div>

        {/* 15 Pattern Checkboxes Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, background: '#0d1117', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
          {[...neutralList, ...bullishList, ...bearishList].map(p => {
            const isChecked = selectedPatterns.includes(p.code)
            const cnt = p.counts ? (p.counts[timeframe]?.tickers ?? 0) : 0
            const badgeBg = p.category === 'BULLISH' ? 'rgba(34,197,94,0.2)' : (p.category === 'BEARISH' ? 'rgba(239,68,68,0.2)' : 'rgba(234,179,8,0.2)')
            const badgeColor = p.category === 'BULLISH' ? '#4ade80' : (p.category === 'BEARISH' ? '#f87171' : '#facc15')

            return (
              <label
                key={p.code}
                onClick={() => togglePattern(p.code)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: isChecked ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isChecked ? '#38bdf8' : 'rgba(255,255,255,0.06)'}`,
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'all .15s ease',
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {}}
                  style={{ accentColor: '#38bdf8', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 12, fontWeight: 700, color: isChecked ? '#f8fafc' : '#94a3b8', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.name}
                </span>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 10, background: badgeBg, color: badgeColor }}>
                  {cnt}
                </span>
              </label>
            )
          })}
        </div>

        <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', padding: '12px 18px', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc' }}>
                {selectedPatterns.length === 15 ? 'All 15 Candlestick Patterns Selected' : `${selectedPatterns.length} Patterns Selected`}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
              Tickers matching any of the checked pattern filters will be displayed in the list below.
            </p>
          </div>

          <div style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>
            Found <b style={{ color: '#38bdf8' }}>{filteredRows.length}</b> Tickers with Active {timeframe} Pattern(s) (Last 7 Days)
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 440px) 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 620, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#0d1117', padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}>
            <Search size={14} style={{ color: '#7ec8f0' }} />
            <input
              type="text"
              placeholder="Search ticker, company, sector…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 12, outline: 'none', width: '100%' }}
            />
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b', fontSize: 13 }}>Scanning {timeframe} pattern instances…</div>
          ) : !filteredRows.length ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b', fontSize: 13 }}>No tickers currently forming <b>{activePatternMeta.name}</b> on {timeframe} timeframe.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#64748b', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px' }}>Ticker</th>
                    <th style={{ padding: '6px 8px' }}>Pattern</th>
                    <th style={{ padding: '6px 8px' }}>Detected Date</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(row => {
                    const isSel = selectedRow && selectedRow.id === row.id
                    const catBg = row.category === 'BULLISH' ? 'rgba(34,197,94,0.15)' : (row.category === 'BEARISH' ? 'rgba(239,68,68,0.15)' : 'rgba(234,179,8,0.15)')
                    const catColor = row.category === 'BULLISH' ? '#4ade80' : (row.category === 'BEARISH' ? '#f87171' : '#facc15')
                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedRow(row)}
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          cursor: 'pointer',
                          background: isSel ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                          transition: 'background .15s ease',
                        }}
                      >
                        <td style={{ padding: '8px 8px' }}>
                          <div style={{ fontWeight: 700, color: isSel ? '#38bdf8' : '#f8fafc', fontFamily: "'DM Mono'" }}>{row.ticker}</div>
                          <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>{row.company_name}</div>
                        </td>
                        <td style={{ padding: '8px 8px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: catBg, color: catColor }}>
                            {row.pattern_name}
                          </span>
                        </td>
                        <td style={{ padding: '8px 8px', color: '#cbd5e1', fontSize: 11 }}>{row.detected_date}</td>
                        <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700, color: '#4ade80' }}>
                          {row.strength_score ? `${Number(row.strength_score).toFixed(0)}%` : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {selectedRow ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc', fontFamily: "'DM Mono'" }}>
                    {selectedRow.ticker} <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>— {selectedRow.company_name}</span>
                  </h3>
                  <span style={{ fontSize: 12, color: '#38bdf8', fontWeight: 600 }}>
                    Highlighting {selectedRow.pattern_name} ({selectedRow.start_date} → {selectedRow.end_date})
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                  <span style={{ color: '#94a3b8' }}>High: <b style={{ color: '#e2e8f0' }}>{isUS ? '$' : '₹'}{selectedRow.high_price}</b></span>
                  <span style={{ color: '#94a3b8' }}>Low: <b style={{ color: '#e2e8f0' }}>{isUS ? '$' : '₹'}{selectedRow.low_price}</b></span>
                  <span style={{ color: '#94a3b8' }}>Close: <b style={{ color: '#e2e8f0' }}>{isUS ? '$' : '₹'}{selectedRow.close_price}</b></span>
                </div>
              </div>

              <ChartErrorBoundary>
                <StockChartVisualizer
                  ticker={selectedRow.ticker}
                  height={460}
                  apiBase={apiBase}
                  highlightedPattern={selectedRow}
                  visiblePatterns={selectedPatterns}
                />
              </ChartErrorBoundary>

              {/* ⚡ Pattern Insights & Possibility Projection Flash Card Banner */}
              <div style={{
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.85))',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: 10,
                padding: '16px 20px',
                marginTop: 8,
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      background: activePatternMeta.category === 'BULLISH' ? 'rgba(34, 197, 94, 0.2)' : (activePatternMeta.category === 'BEARISH' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(234, 179, 8, 0.2)'),
                      padding: 8,
                      borderRadius: 8,
                      display: 'flex',
                      alignItems: 'center'
                    }}>
                      <Zap size={18} style={{ color: activePatternMeta.category === 'BULLISH' ? '#4ade80' : (activePatternMeta.category === 'BEARISH' ? '#f87171' : '#facc15') }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc', letterSpacing: '0.02em' }}>
                        ⚡ Pattern Insights & Possibility Projection
                      </div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        Algorithmic Forecast based on <b style={{ color: '#e2e8f0' }}>{selectedRow.pattern_name}</b> formation ({selectedRow.detected_date})
                      </div>
                    </div>
                  </div>

                  <span style={{
                    fontSize: 12,
                    fontWeight: 800,
                    padding: '4px 12px',
                    borderRadius: 20,
                    background: activePatternMeta.category === 'BULLISH' ? 'rgba(34, 197, 94, 0.15)' : (activePatternMeta.category === 'BEARISH' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(234, 179, 8, 0.15)'),
                    color: activePatternMeta.category === 'BULLISH' ? '#4ade80' : (activePatternMeta.category === 'BEARISH' ? '#f87171' : '#facc15'),
                    border: `1px solid ${activePatternMeta.category === 'BULLISH' ? '#22c55e' : (activePatternMeta.category === 'BEARISH' ? '#ef4444' : '#eab308')}`
                  }}>
                    {activePatternMeta.category === 'BULLISH' ? '🚀 Bullish Target Projection' : (activePatternMeta.category === 'BEARISH' ? '⚠️ Bearish Warning Projection' : '⚖️ Indecision / Consolidation')}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>📈 Pattern High Target</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#38bdf8', fontFamily: "'DM Mono'" }}>
                      {isUS ? '$' : '₹'}{selectedRow.high_price}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Breakout confirmation level</div>
                  </div>

                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>📉 Pattern Low Support / SL</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#f43f5e', fontFamily: "'DM Mono'" }}>
                      {isUS ? '$' : '₹'}{selectedRow.low_price}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Invalidation threshold</div>
                  </div>

                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>🎯 Detection Confidence Score</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#4ade80', fontFamily: "'DM Mono'" }}>
                      {selectedRow.strength_score ? `${Number(selectedRow.strength_score).toFixed(0)}%` : '92%'}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Historical pattern match reliability</div>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: '1.5', background: 'rgba(56, 189, 248, 0.05)', padding: '10px 14px', borderRadius: 6, borderLeft: '3px solid #38bdf8' }}>
                  <b style={{ color: '#38bdf8' }}>Market Projection Analysis:</b> {activePatternMeta.description} Based on historical occurrences of <b>{selectedRow.pattern_name}</b>, {activePatternMeta.category === 'BULLISH' ? 'prices tend to exhibit upside momentum toward target levels if candle close remains above pattern low support.' : (activePatternMeta.category === 'BEARISH' ? 'risk of downside reversal or pullback increases if buyers fail to reclaim pattern high bounds.' : 'high market indecision indicates range-bound consolidation before next directional breakout.')}
                </div>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '100px 20px', color: '#475569' }}>
              <TrendingUp size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
              <p style={{ fontSize: 15, margin: 0 }}>Select a pattern and ticker on the left to view highlighted pattern area.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Pattern Viewer Page ──────────────────────────────────────────────────────
export function PatternViewerPage({ apiBase = '/api/intelligence', dataset = 'intelligence' }) {
  const isUS = dataset === 'us_intelligence'
  return (
    <div style={{ padding: 24, background: '#090d16', minHeight: '100vh', color: '#e2e8f0' }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <TrendingUp size={24} style={{ color: '#38bdf8' }} />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Pattern Viewer</h2>
            <span style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(56,189,248,0.3)' }}>
              {isUS ? 'US MARKET' : 'NSE INDIA'}
            </span>
          </div>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
            Review 15 classic candlestick patterns (Neutral, Bullish & Bearish) across Daily and Weekly timeframes.
          </p>
        </div>
      </div>
      <PatternViewerTab apiBase={apiBase} dataset={dataset} fnoOnly={false} />
    </div>
  )
}

// ─── Indices Pattern Viewer Page ──────────────────────────────────────────────
export function IndicesPatternViewerPage({ apiBase = '/api/intelligence', dataset = 'intelligence' }) {
  const isUS = dataset === 'us_intelligence'
  return (
    <div style={{ padding: 24, background: '#090d16', minHeight: '100vh', color: '#e2e8f0' }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Layers size={24} style={{ color: '#a855f7' }} />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Indices Pattern Viewer</h2>
            <span style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(168,85,247,0.3)' }}>
              {isUS ? 'US MARKET INDICES (QQQ, SPY, DIA, IXIC, GSPC, DJI)' : 'NSE MARKET INDICES (NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, NIFTYNXT50)'}
            </span>
          </div>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
            Review 15 classic candlestick patterns exclusively for key Benchmark Market Indices across Daily and Weekly timeframes.
          </p>
        </div>
      </div>
      <PatternViewerTab apiBase={apiBase} dataset={dataset} indicesOnly={true} />
    </div>
  )
}

// ─── Research Board Page (Period Comparison) ──────────────────────────────────
export function ResearchBoardPage({ apiBase = '/api/intelligence', dataset = 'intelligence' }) {
  const isUS = dataset === 'us_intelligence'

  const fmt = d => d.toISOString().slice(0, 10)
  const sub = (d, days) => { const x = new Date(d); x.setDate(x.getDate() - days); return x }
  const subY = (d, y) => { const x = new Date(d); x.setFullYear(x.getFullYear() - y); return x }
  const today = new Date()

  const [tickers, setTickers] = useState([])
  const [search, setSearch] = useState('')
  const [ticker, setTicker] = useState('')
  const [r1s, setR1s] = useState(fmt(subY(sub(today, 9), 1)))
  const [r1e, setR1e] = useState(fmt(subY(today, 1)))
  const [r2s, setR2s] = useState(fmt(sub(today, 9)))
  const [r2e, setR2e] = useState(fmt(today))
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [mode, setMode] = useState('normalised')
  const [showTable, setShowTable] = useState(false)

  useEffect(() => {
    fetch(`${apiBase}/research/tickers`)
      .then(r => r.json())
      .then(d => { setTickers(d.tickers ?? []); if (d.tickers?.length && !ticker) setTicker(d.tickers[0].ticker) })
      .catch(() => {})
  }, [apiBase])

  const filtered = useMemo(() => {
    if (!search.trim()) return tickers
    const q = search.toLowerCase()
    return tickers.filter(t => t.ticker.toLowerCase().includes(q) || (t.company_name ?? '').toLowerCase().includes(q))
  }, [tickers, search])

  const preset = (p) => {
    const t = new Date()
    if (p === 'MoM_Seq') {
      const r2End = t, r2Start = sub(t, 30), r1End = sub(t, 30), r1Start = sub(t, 60)
      setR2e(fmt(r2End)); setR2s(fmt(r2Start)); setR1e(fmt(r1End)); setR1s(fmt(r1Start))
    } else if (p === 'QoQ_Seq') {
      const r2End = t, r2Start = sub(t, 90), r1End = sub(t, 90), r1Start = sub(t, 180)
      setR2e(fmt(r2End)); setR2s(fmt(r2Start)); setR1e(fmt(r1End)); setR1s(fmt(r1Start))
    } else if (p === 'YoY_MoM') {
      const r2End = t, r2Start = sub(t, 30), r1End = subY(t, 1), r1Start = sub(subY(t, 1), 30)
      setR2e(fmt(r2End)); setR2s(fmt(r2Start)); setR1e(fmt(r1End)); setR1s(fmt(r1Start))
    } else if (p === 'YoY_QoQ') {
      const r2End = t, r2Start = sub(t, 90), r1End = subY(t, 1), r1Start = sub(subY(t, 1), 90)
      setR2e(fmt(r2End)); setR2s(fmt(r2Start)); setR1e(fmt(r1End)); setR1s(fmt(r1Start))
    } else {
      const d = p === '6M' ? 180 : 365
      setR2e(fmt(t)); setR2s(fmt(sub(t, d))); setR1e(fmt(subY(t, 1))); setR1s(fmt(sub(subY(t, 1), d)))
    }
  }

  const run = async () => {
    if (!ticker) { setErr('Please select a ticker first.'); return }
    setErr(null); setLoading(true); setResult(null)
    try {
      const p = new URLSearchParams({ ticker, range1_start: r1s, range1_end: r1e, range2_start: r2s, range2_end: r2e })
      const res = await fetch(`${apiBase}/research/compare?${p}`)
      if (!res.ok) throw new Error((await res.json()).detail || 'API error')
      setResult(await res.json())
    } catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  const s1 = result?.range1?.data ?? []
  const s2 = result?.range2?.data ?? []
  const lbl1 = result ? `${result.range1.start} → ${result.range1.end}` : 'Period 1'
  const lbl2 = result ? `${result.range2.start} → ${result.range2.end}` : 'Period 2'

  const card = { background: '#161b22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16 }
  const inp = { background: '#0d1117', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#e2e8f0', padding: '6px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' }
  const lbl = { color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' }
  const tab = (on) => ({ background: on ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${on ? 'rgba(56,189,248,0.5)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 6, color: on ? '#38bdf8' : '#94a3b8', fontSize: 12, fontWeight: 600, padding: '5px 12px', cursor: 'pointer' })

  return (
    <div style={{ padding: 24, background: '#090d16', minHeight: '100vh', color: '#e2e8f0' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <BarChart3 size={22} style={{ color: '#38bdf8' }} />
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Research Board</h2>
          <span style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(56,189,248,0.3)' }}>PERIOD COMPARISON</span>
        </div>
        <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>Compare any two custom date ranges for a ticker — quarterly, yearly, seasonal or fully custom windows — with overlapping charts.</p>
      </div>

      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20, alignItems: 'start' }}>
          <div>
            <span style={lbl}>🔍 Ticker</span>
            <input type="text" placeholder="Search ticker / company…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, marginBottom: 6 }} />
            <select value={ticker} onChange={e => setTicker(e.target.value)} size={7} style={{ ...inp, height: 'auto', padding: '4px 0' }}>
              {filtered.map(t => (
                <option key={t.ticker} value={t.ticker} style={{ background: '#161b22', padding: '4px 8px' }}>
                  {t.ticker}{t.company_name ? ` — ${t.company_name}` : ''}
                </option>
              ))}
            </select>
            {ticker && <div style={{ marginTop: 6, fontSize: 12, color: '#4ade80', fontWeight: 600 }}>✓ {ticker}</div>}
          </div>

          <div>
            <div style={{ marginBottom: 14 }}>
              <span style={lbl}>⚡ Quick Presets</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  ['MoM_Seq', '📅 Sequential MoM (Last 30D vs Prev 30D)'],
                  ['QoQ_Seq', '📊 Sequential QoQ (Last 90D vs Prev 90D)'],
                  ['YoY_MoM', '🗓️ YoY MoM (Last 30D vs Same 30D Last Year)'],
                  ['YoY_QoQ', '📈 YoY QoQ (Last 90D vs Same 90D Last Year)'],
                  ['6M', '📆 6-Month YoY'],
                  ['1Y', '🏛️ 1-Year YoY']
                ].map(([k, lText]) => (
                  <button key={k} onClick={() => preset(k)} style={tab(false)}>{lText}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.2)', borderRadius: 8, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#38bdf8' }} />
                  <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: 13 }}>Base Period (Blue)</span>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <span style={lbl}>Start Date</span>
                  <input type="date" value={r1s} onChange={e => setR1s(e.target.value)} style={inp} />
                </div>
                <div>
                  <span style={lbl}>End Date</span>
                  <input type="date" value={r1e} onChange={e => setR1e(e.target.value)} style={inp} />
                </div>
              </div>

              <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#f59e0b' }} />
                  <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 13 }}>Comparison Period (Orange)</span>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <span style={lbl}>Start Date</span>
                  <input type="date" value={r2s} onChange={e => setR2s(e.target.value)} style={inp} />
                </div>
                <div>
                  <span style={lbl}>End Date</span>
                  <input type="date" value={r2e} onChange={e => setR2e(e.target.value)} style={inp} />
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={run} disabled={loading} style={{ background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                {loading ? 'Fetching comparison…' : 'Run Comparison ►'}
              </button>
            </div>
          </div>
        </div>

        {err && <div style={{ color: '#ef4444', marginTop: 12, fontSize: 13 }}>⚠️ {err}</div>}
      </div>

      {result && (
        <>
          <div style={{ ...card, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{result.ticker} — {result.meta.company_name || result.ticker}<span style={{ color: '#64748b', fontWeight: 400, fontSize: 13, marginLeft: 8 }}>{result.meta.sector}</span></span>
              <div style={{ marginTop: 8, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#38bdf8' }}><div style={{ width: 28, height: 3, background: '#38bdf8', borderRadius: 2 }} />{lbl1}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#f59e0b' }}><div style={{ width: 28, height: 3, background: '#f59e0b', borderRadius: 2 }} />{lbl2}</span>
                <span style={{ fontSize: 11, color: '#475569', marginLeft: 'auto' }}>X-axis = trading-day index</span>
              </div>
            </div>
            <ChartErrorBoundary>
              {mode === 'normalised'
                ? <OverlapChart series1={s1} series2={s2} label1={lbl1} label2={lbl2} height={400} />
                : <AbsolutePriceChart series1={s1} series2={s2} label1={lbl1} label2={lbl2} height={400} />}
            </ChartErrorBoundary>
          </div>
        </>
      )}

      {!result && !loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#475569' }}>
          <BarChart3 size={48} style={{ marginBottom: 16, opacity: 0.3 }} />
          <p style={{ fontSize: 15, margin: 0 }}>Select a ticker and two date ranges, then click <strong style={{ color: '#94a3b8' }}>Run Comparison</strong></p>
          <p style={{ fontSize: 13, marginTop: 8 }}>e.g. 4-Aug-2025 → 22-Aug-2025  vs  4-Aug-2026 → 22-Aug-2026</p>
        </div>
      )}
    </div>
  )
}
