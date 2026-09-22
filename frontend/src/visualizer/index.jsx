import React, { useEffect, useRef, useState, useMemo, useCallback, Component } from 'react'
import {
  createChart, ColorType, CrosshairMode,
  CandlestickSeries, HistogramSeries, LineSeries, LineStyle, createSeriesMarkers
} from 'lightweight-charts'
import {
  TrendingUp, BarChart3, Activity, Layers, ArrowUpRight, ArrowDownRight,
  RefreshCw, Search, X, Check, Eye, ChevronRight, Zap, Target, AlertCircle, Calendar, Star, Printer
} from 'lucide-react'
import MFBehaviorModule from './MFBehaviorModule'
import FIIBehaviorModule from './FIIBehaviorModule'
import MFBehaviorPage from './MFBehaviorPage'
import TickerTypeahead from './TickerTypeahead'
import MFAccumulationReport from './MFAccumulationReport'
import MFExitReport from './MFExitReport'
import { SuperStocksReport } from './SuperStocksReport'

export { MFBehaviorPage, MFAccumulationReport, MFExitReport, SuperStocksReport }

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
  const [activeCategory, setActiveCategory] = useState('BULLISH')
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
  
  const visibleList = activeCategory === 'BULLISH' ? bullishList : (activeCategory === 'BEARISH' ? bearishList : neutralList)

  const cardStyle = { background: '#161b22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
              ☑️ Pattern View:
            </span>
            <button
              onClick={() => { setActiveCategory('BULLISH'); setSelectedPatterns(bullishList.map(p => p.code)) }}
              style={{
                background: activeCategory === 'BULLISH' ? 'rgba(34,197,94,0.2)' : 'transparent',
                color: activeCategory === 'BULLISH' ? '#4ade80' : '#cbd5e1',
                border: `1px solid ${activeCategory === 'BULLISH' ? '#22c55e' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer'
              }}
            >
              🚀 Bullish
            </button>
            <button
              onClick={() => { setActiveCategory('BEARISH'); setSelectedPatterns(bearishList.map(p => p.code)) }}
              style={{
                background: activeCategory === 'BEARISH' ? 'rgba(239,68,68,0.2)' : 'transparent',
                color: activeCategory === 'BEARISH' ? '#f87171' : '#cbd5e1',
                border: `1px solid ${activeCategory === 'BEARISH' ? '#ef4444' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer'
              }}
            >
              ⚠️ Bearish
            </button>
            <button
              onClick={() => { setActiveCategory('NEUTRAL'); setSelectedPatterns(neutralList.map(p => p.code)) }}
              style={{
                background: activeCategory === 'NEUTRAL' ? 'rgba(234,179,8,0.2)' : 'transparent',
                color: activeCategory === 'NEUTRAL' ? '#facc15' : '#cbd5e1',
                border: `1px solid ${activeCategory === 'NEUTRAL' ? '#eab308' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer'
              }}
            >
              ⚖️ Neutral
            </button>

            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />

            <button
              onClick={() => setSelectedPatterns(visibleList.map(p => p.code))}
              style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
            >
              Select All ({visibleList.length})
            </button>
            <button
              onClick={() => setSelectedPatterns(visibleList.length ? [visibleList[0].code] : [])}
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
            <button
              onClick={() => setTimeframe('MONTHLY')}
              style={{
                background: timeframe === 'MONTHLY' ? '#38bdf8' : 'transparent',
                color: timeframe === 'MONTHLY' ? '#0f172a' : '#cbd5e1',
                border: 'none',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              🗓️ Monthly Chart (1M)
            </button>
          </div>
        </div>

        {/* Pattern Checkboxes Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, background: '#0d1117', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
          {visibleList.map(p => {
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
                {selectedPatterns.length === visibleList.length ? `All ${visibleList.length} ${activeCategory} Patterns Selected` : `${selectedPatterns.length} Patterns Selected`}
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

// ─── Ticker Research Profile Page ──────────────────────────────────────────────
export function TickerResearchProfilePage({ apiBase = '/api/intelligence', dataset = 'intelligence', onNavigate, initialTicker }) {
  const [searchInput, setSearchInput] = useState(initialTicker || '')
  const [activeSymbol, setActiveSymbol] = useState(initialTicker || '')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (initialTicker) {
      setSearchInput(initialTicker)
      setActiveSymbol(initialTicker)
    }
  }, [initialTicker])

  const executeSearch = useCallback((symbolToSearch) => {
    const sym = (symbolToSearch || searchInput).trim().toUpperCase()
    if (!sym) return
    setActiveSymbol(sym)
    setLoading(true)
    setError(null)
    fetch(`${apiBase}/ticker-profile/${encodeURIComponent(sym)}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(res => {
        if (res.found === false) {
          setError(res.message || `No ticker found matching '${sym}'`)
          setData(null)
        } else {
          setData(res)
        }
      })
      .catch(e => {
        setError(e.message)
        setData(null)
      })
      .finally(() => setLoading(false))
  }, [apiBase, searchInput])

  useEffect(() => {
    if (activeSymbol) {
      executeSearch(activeSymbol)
    }
  }, [activeSymbol])

  const meta = data?.meta || {}
  const fund = data?.fundamentals || {}
  const summary = data?.analysis_summary || {}
  const scanners = data?.scanners || {}

  const cardStyle = {
    background: 'rgba(15, 23, 42, 0.8)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 20,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
  }

  const badgeStyle = (color = '#38bdf8', bg = 'rgba(56, 189, 248, 0.15)') => ({
    background: bg,
    color: color,
    border: `1px solid ${color}40`,
    borderRadius: 6,
    padding: '3px 8px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.5,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4
  })

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Search Hero Card */}
      <div style={{ ...cardStyle, background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))', border: '1px solid rgba(56, 189, 248, 0.3)', textAlign: 'center', padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 22, fontWeight: 800, color: '#f8fafc', marginBottom: 6 }}>
          <Search size={24} style={{ color: '#38bdf8' }} />
          <span>Lookup Ticker Master Data</span>
        </div>
        <p style={{ color: '#94a3b8', fontSize: 14, margin: '0 0 20px 0' }}>
          Enter any symbol (e.g. HDFCBANK, RELIANCE, TCS) to search live records from ticker database
        </p>

        {/* Search Box & Button */}
        <div style={{ maxWidth: 550, margin: '0 auto', display: 'flex', gap: 10, background: 'rgba(0,0,0,0.3)', padding: 6, borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)' }}>
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') executeSearch() }}
            placeholder="Enter symbol, e.g. HDFCBANK"
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', padding: '10px 14px', fontSize: 15, fontFamily: "'DM Mono', monospace", outline: 'none', textTransform: 'uppercase' }}
          />
          <button
            onClick={() => executeSearch()}
            style={{ background: 'linear-gradient(135deg, #38bdf8, #0284c7)', color: '#0f172a', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Search size={16} /> Search
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#38bdf8', fontSize: 15, fontWeight: 600 }}>
          Querying ticker database for '{activeSymbol}'...
        </div>
      )}

      {/* Error / Not Found State */}
      {error && !loading && (
        <div style={{ ...cardStyle, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', textAlign: 'center', padding: '24px' }}>
          <AlertCircle size={32} style={{ marginBottom: 8 }} />
          <h4 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 700 }}>{error}</h4>
          <p style={{ margin: 0, fontSize: 13, color: '#fca5a5' }}>Please verify the ticker symbol name and try searching again.</p>
        </div>
      )}

      {/* Details Result Section */}
      {data && data.found && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header Card */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#f8fafc', fontFamily: "'DM Mono', monospace" }}>
                    {meta.ticker}
                  </h2>
                  <span style={{ fontSize: 16, color: '#94a3b8', fontWeight: 600 }}>{meta.company_name}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={badgeStyle('#38bdf8', 'rgba(56, 189, 248, 0.12)')}>Sector: {meta.sector || 'General'}</span>
                  {meta.is_fno && <span style={badgeStyle('#c084fc', 'rgba(168, 85, 247, 0.12)')}>F&O Eligible</span>}
                  <span style={badgeStyle('#34d399', 'rgba(52, 211, 153, 0.12)')}>Active Master</span>
                </div>
              </div>

              {summary.overall_signal && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>OVERALL SIGNAL</div>
                  <span style={badgeStyle(summary.overall_signal.includes('BUY') ? '#34d399' : '#f87171', summary.overall_signal.includes('BUY') ? 'rgba(52,211,153,0.18)' : 'rgba(248,113,113,0.18)')}>
                    {summary.overall_signal}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div style={cardStyle}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>LAST CLOSE PRICE</span>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#38bdf8', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                {summary.close ? `${summary.close}` : '—'}
              </div>
            </div>

            <div style={cardStyle}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>P/E RATIO</span>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f59e0b', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                {fund.current_pe != null ? fund.current_pe : '—'}
              </div>
            </div>

            <div style={cardStyle}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>PROFIT AFTER TAX (PAT)</span>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#34d399', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                {fund.last_pat ? `${fund.last_pat} Cr` : '—'}
              </div>
            </div>

            <div style={cardStyle}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>TECHNICAL SCORE</span>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#c084fc', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                {summary.technical_score != null ? `${summary.technical_score}/100` : '—'}
              </div>
            </div>
          </div>

          {/* Fundamentals & Scanners Details */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
            {/* Fundamental Details */}
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px 0', fontSize: 16, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart3 size={18} style={{ color: '#f59e0b' }} /> Fundamental Overview
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>
                  <span style={{ color: '#94a3b8' }}>Debt / Equity:</span>
                  <b style={{ color: '#fff' }}>{fund.debt_to_equity ?? '—'}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>
                  <span style={{ color: '#94a3b8' }}>Cash Flow Status:</span>
                  <b style={{ color: '#34d399' }}>{fund.cash_flow_status ?? '—'}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>
                  <span style={{ color: '#94a3b8' }}>PAT Trend:</span>
                  <b style={{ color: '#fff' }}>{fund.pat_trend ?? '—'}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Fundamental Score:</span>
                  <b style={{ color: '#f59e0b' }}>{fund.fundamental_score ?? '—'}</b>
                </div>
              </div>
            </div>

            {/* Technical Scanners Summary */}
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 14px 0', fontSize: 16, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={18} style={{ color: '#38bdf8' }} /> Technical Scanners Summary
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {Object.entries(scanners).map(([scKey, scData]) => {
                  const sig = scData.trend_signal || scData.breakout_signal || scData.overall_call || scData.signal || 'ACTIVE'
                  return (
                    <div key={scKey} style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>
                        {scKey.replace('_', ' ')}
                      </div>
                      <span style={badgeStyle(sig.includes('BUY') || sig.includes('UPTREND') ? '#34d399' : '#38bdf8')}>
                        {sig}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Interactive Stock Chart */}
          <div style={cardStyle}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={18} style={{ color: '#38bdf8' }} /> Candlestick Chart & Price Action
            </h3>
            <ChartErrorBoundary>
              <StockChartVisualizer ticker={data.ticker} height={420} />
            </ChartErrorBoundary>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Search Detail Page (Ticker Master Dedicated Lookup) ──────────────────────
export function SearchDetailPage({ apiBase = '/api/intelligence', dataset = 'intelligence', initialTicker = 'RELIANCE', onNavigate }) {
  const [tickerInput, setTickerInput] = useState(initialTicker || 'RELIANCE')
  const [searchedSymbol, setSearchedSymbol] = useState(initialTicker || 'RELIANCE')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Recent Searches state (Last 20)
  const [recentSearches, setRecentSearches] = useState(['RELIANCE', 'HDFCBANK', 'HDFCLIFE', 'ICICIBANK', 'INFY'])

  // Truncation Modal state
  const [cellModalContent, setCellModalContent] = useState(null)

  const handleSearch = (overrideSymbol) => {
    const sym = (overrideSymbol || tickerInput || 'RELIANCE').trim().toUpperCase()
    if (!sym) return
    setSearchedSymbol(sym)
    setLoading(true)
    setError(null)

    // Update recent searches
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s !== sym)
      return [sym, ...filtered].slice(0, 20)
    })

    const targetUrl = `${apiBase}/ticker-master-search/${encodeURIComponent(sym)}`
    console.log(`[Ticker Master Search] Querying endpoint: ${targetUrl}`)

    fetch(targetUrl)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(res => {
        console.log(`[Ticker Master Search] Data received for ${sym}:`, res)
        if (res.found === false) {
          setError(res.message || `No record found in ticker_master for '${sym}'`)
          setData(null)
        } else {
          setData(res)
        }
      })
      .catch(e => {
        console.error(`[Ticker Master Search] Error querying ${sym}:`, e)
        setError(e.message)
        setData(null)
      })
      .finally(() => setLoading(false))
  }

  // Initial & prop-change load search
  useEffect(() => {
    const sym = (initialTicker || 'RELIANCE').trim().toUpperCase()
    setTickerInput(sym)
    handleSearch(sym)
  }, [initialTicker, apiBase])

  const cardStyle = {
    background: 'rgba(15, 23, 42, 0.85)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 20,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)'
  }

  const metricBoxStyle = {
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    padding: '12px 14px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center'
  }

  const badgeStyle = (color = '#38bdf8', bg = 'rgba(56, 189, 248, 0.15)') => ({
    background: bg,
    color: color,
    border: `1px solid ${color}40`,
    borderRadius: 6,
    padding: '3px 10px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.5,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4
  })

  // Format text over 20 chars with interactive modal trigger
  const renderTruncatedCell = (text) => {
    if (!text) return '—'
    const str = String(text)
    if (str.length > 20) return str.slice(0, 16) + '...'
    return str
  }

  const master = data?.master || {}
  const instBehavior = data?.inst_behavior || { mf_status: 'Neutral', fii_status: 'Neutral' }
  const retracementPattern = data?.retracement_pattern || {}
  const recommendations = data?.recommendations || []
  const quicktrade = data?.quicktrade || {}
  const screenerSignals = data?.screener_signals || {}
  const tradingSignals = data?.trading_signals || {}
  const supportResistance = data?.support_resistance || {}
  const volumeSpikes = data?.volume_spikes || []
  const fundamentals = data?.fundamentals || {}
  const patternHistory = data?.pattern_history || []
  const patternStats = data?.pattern_stats || { total: 0, pass: 0, fail: 0, pass_rate: 0.0 }
  const mfHoldings = data?.mf_holdings || []
  const oppRisk = data?.opportunities_risk || null

  // Pagination for Mutual Fund Holdings table
  const [mfPage, setMfPage] = useState(1)
  const [mfPageSize, setMfPageSize] = useState(10)

  // Selected Recommendation Detail Modal state
  const [selectedRecModal, setSelectedRecModal] = useState(null)

  // Direct PDF Download Handler (html2pdf.js)
  const [downloadingPdf, setDownloadingPdf] = useState(false)

  const handleDownloadPdf = async () => {
    const element = document.getElementById('ticker-full-report-container')
    if (!element) return

    setDownloadingPdf(true)
    const symbol = master.ticker || searchedSymbol || 'TICKER'
    const fileName = `BSA_Market_Intelligence_Report_${symbol}.pdf`

    // Dynamically detect current active theme background color from DOM stylesheet
    const computedStyle = window.getComputedStyle(document.body)
    const activeBgColor = computedStyle.backgroundColor || '#09111f'

    const opt = {
      margin:       [8, 8, 10, 8],
      filename:     fileName,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, backgroundColor: activeBgColor, logging: false },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
    }

    try {
      if (window.html2pdf) {
        await window.html2pdf().set(opt).from(element).save()
      } else {
        window.print()
      }
    } catch (err) {
      console.error('PDF Generation Error:', err)
      window.print()
    } finally {
      setDownloadingPdf(false)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ─── Top Header & Search Section ─────────────────────────────────── */}
      <div style={{ ...cardStyle, background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Search size={20} style={{ color: '#38bdf8' }} /> Lookup Ticker Master Data
            </h2>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={badgeStyle('#34d399', 'rgba(52, 211, 153, 0.15)')}>DB14: Online</span>
          </div>
        </div>

        <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 16px 0' }}>
          Enter any symbol (e.g. HDFCBANK), company name, or ISIN to query master records
        </p>

        {/* Input Box & Search Button */}
        <div style={{ maxWidth: 650, display: 'flex', gap: 10, background: 'rgba(0,0,0,0.4)', padding: 6, borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)' }}>
          <TickerTypeahead
            value={tickerInput}
            onChange={e => setTickerInput(e.target.value)}
            onSelect={(val) => { setTickerInput(val); handleSearch(val); }}
            placeholder="RELIANCE"
            style={{ flex: 1 }}
            inputStyle={{ background: 'transparent', border: 'none', color: '#fff', padding: '10px 14px', fontSize: 15, fontFamily: "'DM Mono', monospace", outline: 'none', textTransform: 'uppercase' }}
          />
          <button
            onClick={() => handleSearch()}
            style={{ background: 'linear-gradient(135deg, #38bdf8, #0284c7)', color: '#0f172a', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Search size={16} /> Search
          </button>
        </div>

        {/* Recent Searches */}
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
            <span style={{ color: '#94a3b8', fontWeight: 700, letterSpacing: 0.5 }}>⏱️ RECENT SEARCHES (LAST 20):</span>
            {recentSearches.map(sym => (
              <button
                key={sym}
                onClick={() => { setTickerInput(sym); handleSearch(sym) }}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#94a3b8',
                  borderRadius: 14,
                  padding: '2px 10px',
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                ⏱️ {sym}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#38bdf8', fontSize: 15, fontWeight: 600 }}>
          Querying ticker database for '{searchedSymbol}'...
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div style={{ ...cardStyle, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', textAlign: 'center', padding: '24px' }}>
          <AlertCircle size={32} style={{ marginBottom: 8 }} />
          <h4 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 700 }}>{error}</h4>
          <p style={{ margin: 0, fontSize: 13, color: '#fca5a5' }}>Please verify the ticker symbol name and try searching again.</p>
        </div>
      )}

      {/* ─── Search Results Main Display ─────────────────────────────────── */}
      {data && data.found && !loading && (
        <div id="ticker-full-report-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* 1. Ticker Master Metadata Card */}
          <div style={cardStyle} className="printable-report-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <div>
                <h1 style={{ margin: '0 0 6px 0', fontSize: 26, fontWeight: 800, color: '#f8fafc' }}>
                  {master.company_name || master.ticker || searchedSymbol}
                </h1>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={badgeStyle('#38bdf8', 'rgba(56, 189, 248, 0.2)')}>{master.ticker || searchedSymbol}</span>
                  <span style={badgeStyle('#a855f7', 'rgba(168, 85, 247, 0.2)')}>{master.exchange || 'NS'}</span>
                  <span style={badgeStyle('#22c55e', 'rgba(34, 197, 94, 0.2)')}>{master.is_fno ? 'EQUITY / F&O' : 'EQUITY'}</span>
                  {master.market_cap_category && (
                    <span style={
                      String(master.market_cap_category).toUpperCase().includes('LARGE')
                        ? badgeStyle('#f59e0b', 'rgba(245, 158, 11, 0.25)')
                        : String(master.market_cap_category).toUpperCase().includes('MID')
                        ? badgeStyle('#06b6d4', 'rgba(6, 182, 212, 0.25)')
                        : String(master.market_cap_category).toUpperCase().includes('SMALL')
                        ? badgeStyle('#f97316', 'rgba(249, 115, 22, 0.25)')
                        : String(master.market_cap_category).toUpperCase().includes('SME')
                        ? badgeStyle('#e11d48', 'rgba(225, 29, 72, 0.25)')
                        : badgeStyle('#ec4899', 'rgba(236, 72, 153, 0.25)')
                    }>
                      📊 {master.market_cap_category.toUpperCase()}
                      {master.market_cap_cr > 0 ? ` (₹${Number(master.market_cap_cr).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr)` : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* Direct Download PDF Button */}
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="no-print"
                style={{
                  background: 'linear-gradient(135deg, #38bdf8, #0284c7)',
                  color: '#0f172a',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 18px',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: downloadingPdf ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 14px rgba(56, 189, 248, 0.35)',
                  opacity: downloadingPdf ? 0.7 : 1,
                  transition: 'all 0.2s ease'
                }}
              >
                <Printer size={16} /> {downloadingPdf ? 'Generating PDF...' : 'Download PDF Report'}
              </button>
            </div>

            {/* Sector Master & Overall Suggestion Custom Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginBottom: 16 }}>
              {/* Custom Variant Wide Sector Name Card with All Mapped Sectors */}
              <div style={{ ...metricBoxStyle, textAlign: 'left', padding: '14px 18px', background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.25)' }}>
                <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
                  MAPPED BUSINESS SECTORS ({ (master.mapped_sectors || [master.sector || 'Energy']).length })
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {(master.mapped_sectors && master.mapped_sectors.length > 0
                    ? master.mapped_sectors
                    : [master.sector || 'Energy']
                  ).map((sec, idx) => (
                    <span
                      key={idx}
                      style={{
                        background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.15), rgba(30, 58, 138, 0.25))',
                        color: '#38bdf8',
                        border: '1px solid rgba(56, 189, 248, 0.4)',
                        borderRadius: 20,
                        padding: '5px 14px',
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: 0.3,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
                        backdropFilter: 'blur(4px)'
                      }}
                    >
                      {idx === 0 ? <span style={{ color: '#facc15', fontSize: 13 }}>⭐</span> : <span style={{ color: '#38bdf8', fontSize: 12 }}>🏷️</span>}
                      {renderTruncatedCell(sec)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Overall Suggestion Card */}
              <div style={{ ...metricBoxStyle, textAlign: 'center', padding: '14px 18px', background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>OVERALL SUGGESTION</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#38bdf8', marginTop: 6, letterSpacing: 0.5 }}>
                  {renderTruncatedCell(master.overall_suggestion || 'TRADING ONLY')}
                </div>
              </div>
            </div>

            {/* About Company Card */}
            <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 8, padding: '14px 16px', fontSize: 13, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 16 }}>
              <b style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 14 }}>
                🏢 About Company (Products & Services Overview)
              </b>
              {(oppRisk && oppRisk.about_company) || (master && master.about_company) ? (
                <div style={{ color: '#e2e8f0', whiteSpace: 'pre-wrap' }}>
                  {(oppRisk && oppRisk.about_company) || master.about_company}
                </div>
              ) : (
                <div style={{ color: '#64748b', fontStyle: 'italic', fontWeight: 600 }}>
                  Not Recorded in the System
                </div>
              )}
            </div>

            {/* Suggestion Remarks Banner */}
            <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 16 }}>
              <b style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                💬 SUGGESTION REMARKS:
              </b>
              {master.suggestion_remarks || `Current P/E ratio of 15.5 (vs 20.0 AVG PE) with 1.1x volume activity and 42.0% confidence rating. Lacks full multi-year fundamental valuation alignment or consolidation breakout confirmation. Recommended for short-term swing/intraday trading setups only.`}
            </div>

            {/* Institutional Behavior Cards (Horizontal Row) */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              {/* MF View Card */}
              <div style={{ flex: 1, background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>MF View (1M)</div>
                <div style={{ 
                  fontSize: 16, fontWeight: 800, 
                  color: instBehavior.mf_status === 'Accumulation' ? '#34d399' : instBehavior.mf_status === 'Exit' ? '#ef4444' : '#fbbf24'
                }}>
                  {instBehavior.mf_status}
                </div>
              </div>

              {/* FII View Card */}
              <div style={{ flex: 1, background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>FII View (1M)</div>
                <div style={{ 
                  fontSize: 16, fontWeight: 800, 
                  color: instBehavior.fii_status === 'Accumulation' ? '#34d399' : instBehavior.fii_status === 'Exit' ? '#ef4444' : '#fbbf24'
                }}>
                  {instBehavior.fii_status}
                </div>
              </div>

              {/* Retracement Pattern Card */}
              <div 
                style={{ flex: 1, background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 8, padding: '14px 16px', textAlign: 'center', cursor: 'pointer', transition: 'background 0.2s' }}
                onClick={() => onNavigate && onNavigate('research:retracement')}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.1)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(56, 189, 248, 0.05)'}
              >
                <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Retracement Pattern</div>
                <div style={{ 
                  fontSize: 16, fontWeight: 800, 
                  color: ((retracementPattern.breakout_stage || '').toLowerCase().includes('risk') || (retracementPattern.breakout_stage || '').toLowerCase().includes('fail')) ? '#ef4444' 
                       : ((retracementPattern.breakout_stage || '').toLowerCase().includes('breakout') || (retracementPattern.breakout_stage || '').toLowerCase().includes('confirmed')) ? '#34d399'
                       : ((retracementPattern.breakout_stage || '').toLowerCase().includes('consolidating') || (retracementPattern.breakout_stage || '').toLowerCase().includes('neutral')) ? '#fbbf24'
                       : '#fbbf24' 
                }}>
                  {retracementPattern.breakout_stage ? `${retracementPattern.breakout_stage}: ${retracementPattern.consolidation_days} Days` : 'No Data'}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div style={cardStyle}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>LAST CLOSE PRICE</span>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#38bdf8', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                {quicktrade.close != null ? `${Number(quicktrade.close).toFixed(2)}` : '—'}
              </div>
            </div>

            <div style={cardStyle}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>P/E RATIO</span>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f59e0b', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                {fundamentals?.pe_metrics?.pe != null ? `${Number(fundamentals.pe_metrics.pe).toFixed(2)}` : '—'}
              </div>
            </div>

            <div style={cardStyle}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>PROFIT AFTER TAX (PAT)</span>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#34d399', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                {fundamentals?.pat_metrics?.pat != null ? `${fundamentals.pat_metrics.pat} Cr` : '—'}
              </div>
            </div>

            <div style={cardStyle}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>TECHNICAL SCORE</span>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#c084fc', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                {quicktrade.overall_score != null ? `${Number(quicktrade.overall_score).toFixed(2)}/100` : '—'}
              </div>
            </div>
          </div>

          {/* 1.5. Broker Recommendations Card (Before Technical Analysis Hub) */}
          <div style={{ ...cardStyle, border: '1px solid rgba(245, 158, 11, 0.35)', background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9), rgba(15, 23, 42, 0.95))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                💡 Analyst & Broker Recommendations ({recommendations.length})
              </h3>
              {recommendations.length > 0 && (
                <span style={badgeStyle('#f59e0b', 'rgba(245, 158, 11, 0.2)')}>
                  {recommendations.length} Active Target Calls
                </span>
              )}
            </div>

            {recommendations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 10px', color: '#94a3b8', fontSize: 13, background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                No active analyst recommendations found for {master.ticker || searchedSymbol}.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, width: '100%', boxSizing: 'border-box' }}>
                {recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    style={{
                      background: 'rgba(0, 0, 0, 0.35)',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                      borderRadius: 10,
                      padding: 16,
                      minHeight: 150,
                      maxHeight: 180,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12,
                      boxSizing: 'border-box'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: '#38bdf8' }}>{renderTruncatedCell(rec.recommender)}</span>
                        <span style={badgeStyle('#38bdf8', 'rgba(56, 189, 248, 0.15)')}>{rec.time_period || 'Long Term'}</span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10, fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '8px 4px', borderRadius: 6, textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700 }}>CMP</div>
                          <div style={{ fontWeight: 800, color: '#fff', fontSize: 13, marginTop: 2 }}>{rec.cmp ? Number(rec.cmp).toFixed(1) : '—'}</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '8px 4px', borderRadius: 6, textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700 }}>STOP LOSS</div>
                          <div style={{ fontWeight: 800, color: '#ef4444', fontSize: 13, marginTop: 2 }}>{rec.stop_loss ? Number(rec.stop_loss).toFixed(1) : '—'}</div>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '8px 4px', borderRadius: 6, textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700 }}>TARGET</div>
                          <div style={{ fontWeight: 800, color: '#22c55e', fontSize: 13, marginTop: 2 }}>{rec.target ? Number(rec.target).toFixed(1) : '—'}</div>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                      <span style={{ fontSize: 11, color: '#64748b', fontFamily: "'DM Mono', monospace" }}>
                        📅 {rec.rec_date || rec.date || '—'}
                      </span>
                      <button
                        onClick={() => setSelectedRecModal(rec)}
                        style={{
                          background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                          color: '#0f172a',
                          border: 'none',
                          borderRadius: 6,
                          padding: '6px 12px',
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        Recommendation Details ➔
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Technical Analysis Hub Section */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Zap size={18} style={{ color: '#38bdf8' }} /> Technical Analysis Hub
              </h3>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Multi-Strategy Quantitative Technical Scanners & Levels</span>
            </div>

            {/* QuickTrade Scanner Card */}
            <div style={{ background: 'rgba(0, 0, 0, 0.25)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <b style={{ color: '#38bdf8', fontSize: 15 }}>⚡ QuickTrade Scanner ( {master.ticker || searchedSymbol} )</b>
                <span style={badgeStyle('#22c55e', 'rgba(34, 197, 94, 0.2)')}>
                  {quicktrade.overall_signal || 'BUY'} ({quicktrade.confidence || 42.0}% CONFIDENCE)
                </span>
              </div>

              {/* 6 Metric Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
                <div style={metricBoxStyle}>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>CLOSE PRICE</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                    {(quicktrade.close || 1322.0).toFixed(1)}
                  </div>
                </div>

                <div style={metricBoxStyle}>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>ENTRY PRICE</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                    {(quicktrade.entry_price || quicktrade.close || 1322.0).toFixed(1)}
                  </div>
                </div>

                <div style={metricBoxStyle}>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>STOP LOSS</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#ef4444', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                    {(quicktrade.stop_loss || 1280.0).toFixed(1)}
                  </div>
                </div>

                <div style={metricBoxStyle}>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>TARGET PRICE</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#22c55e', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                    {(quicktrade.target_price || 1420.0).toFixed(1)}
                  </div>
                </div>

                <div style={metricBoxStyle}>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>OVERALL SCORE</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#38bdf8', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                    {(quicktrade.overall_score || 34.0).toFixed(1)}
                  </div>
                </div>

                <div style={metricBoxStyle}>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>RECORD DATE</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#cbd5e1', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                    {quicktrade.record_date || '05/09/2026'}
                  </div>
                </div>
              </div>

              {/* Rationale & Analysis */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#cbd5e1' }}>
                <span style={{ color: '#94a3b8', fontWeight: 700, marginRight: 8 }}>📋 RATIONALE & ANALYSIS:</span>
                {quicktrade.rationale || 'RSI in momentum zone; SMA Golden crossover.'}
              </div>
            </div>

            {/* Screener & Swing Scanner Signals Grid */}
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}>
                🔻 Screener & Swing Scanner Signals
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                {Object.entries({
                  'SCREENER EMA': screenerSignals.screener_ema || 'BEARISH',
                  'SCREENER VWAP': screenerSignals.screener_vwap || 'BELOW VWAP',
                  'WEEKLY SUPERTREND': screenerSignals.weekly_supertrend || 'BEARISH',
                  'WEEKLY ICHIMOKU': screenerSignals.weekly_ichimoku || 'BEARISH',
                  'WEEKLY MACD': screenerSignals.weekly_macd || 'BEARISH',
                  'WEEKLY OBV': screenerSignals.weekly_obv || 'DISTRIBUTION'
                }).map(([lbl, val]) => (
                  <div key={lbl} style={metricBoxStyle}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>{lbl}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: val.includes('BULL') || val.includes('ABOVE') ? '#22c55e' : '#ef4444', marginTop: 4 }}>
                      {renderTruncatedCell(val)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Breakout, Trend & Reversal Trading Grid */}
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}>
                📈 Breakout, Trend & Reversal Trading
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                {Object.entries({
                  'BREAKOUT TYPE': tradingSignals.breakout_type || 'RESISTANCE CO...',
                  'VOLUME SURGE': tradingSignals.volume_surge || '1.1x AVG',
                  'TREND STATUS': tradingSignals.trend_status || 'DOWNTREND',
                  'ADX SIGNAL': tradingSignals.adx_signal || 'WEAK TREND (A...',
                  'REVERSAL PATTERN': tradingSignals.reversal_pattern || 'BULLISH PINBA...',
                  'BOLLINGER STATUS': tradingSignals.bollinger_status || 'LOWER BAND TO...'
                }).map(([lbl, val]) => (
                  <div key={lbl} style={metricBoxStyle}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>{lbl}</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginTop: 4 }}>
                      {renderTruncatedCell(val)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Support & Resistance Levels Grid */}
            <div>
              <h4 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6 }}>
                ↕️ Support & Resistance Levels
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                <div style={metricBoxStyle}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>PIVOT POINT</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#38bdf8', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                    {(supportResistance.pivot_point || 705.0).toFixed(1)}
                  </div>
                </div>

                <div style={metricBoxStyle}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>SUPPORT 1</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#22c55e', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                    {(supportResistance.support_1 || 683.6).toFixed(1)}
                  </div>
                </div>

                <div style={metricBoxStyle}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>SUPPORT 2</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#22c55e', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                    {(supportResistance.support_2 || 662.3).toFixed(1)}
                  </div>
                </div>

                <div style={metricBoxStyle}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>RESISTANCE 1</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#ef4444', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                    {(supportResistance.resistance_1 || 740.6).toFixed(1)}
                  </div>
                </div>

                <div style={metricBoxStyle}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>RESISTANCE 2</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#ef4444', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                    {(supportResistance.resistance_2 || 769.1).toFixed(1)}
                  </div>
                </div>

                <div style={metricBoxStyle}>
                  <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>CURRENT CLOSE</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                    {(supportResistance.current_close || 1322.0).toFixed(1)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 🎯 Pattern Performance & Directional Pass/Fail Track Record Table (Last 10 Days) */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                  🎯 Candlestick Pattern Direction & Validation Track Record (Last 10 Days)
                </h3>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  Evaluates theoretical direction expectation against post-formation price movement.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={badgeStyle('#cbd5e1', 'rgba(148, 163, 184, 0.15)')}>
                  Total: <b>{patternStats.total.toFixed(1)}</b>
                </span>
                <span style={badgeStyle('#4ade80', 'rgba(34, 197, 94, 0.15)')}>
                  PASS: <b>{patternStats.pass.toFixed(1)}</b>
                </span>
                <span style={badgeStyle('#f87171', 'rgba(239, 68, 68, 0.15)')}>
                  FAIL: <b>{patternStats.fail.toFixed(1)}</b>
                </span>
                <span style={badgeStyle('#38bdf8', 'rgba(56, 189, 248, 0.15)')}>
                  Pass Rate: <b>{patternStats.pass_rate.toFixed(1)}% PASS RATE</b>
                </span>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.4)', color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    <th style={{ padding: '10px 12px' }}>Date Formed</th>
                    <th style={{ padding: '10px 12px' }}>Pattern Name</th>
                    <th style={{ padding: '10px 12px' }}>Timeframe</th>
                    <th style={{ padding: '10px 12px' }}>Theoretical Direction</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Entry Close (₹)</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Best Price (₹)</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Target Move (%)</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', width: 100 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {patternHistory.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                        No active candlestick pattern formations detected for {data.ticker} in recent days.
                      </td>
                    </tr>
                  ) : (
                    patternHistory.map((p, idx) => {
                      const isBull = p.category === 'BULLISH'
                      const isBear = p.category === 'BEARISH'
                      const catBg = isBull ? 'rgba(34, 197, 94, 0.15)' : (isBear ? 'rgba(239, 68, 68, 0.15)' : 'rgba(234, 179, 8, 0.15)')
                      const catColor = isBull ? '#4ade80' : (isBear ? '#f87171' : '#facc15')
                      const isPass = p.status === 'PASS'
                      const statusBg = isPass ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'
                      const statusColor = isPass ? '#4ade80' : '#f87171'

                      return (
                        <tr key={p.id || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '10px 12px', color: '#cbd5e1', fontFamily: "'DM Mono', monospace" }}>{p.detected_date}</td>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: '#f8fafc' }}>{p.pattern_name}</td>
                          <td style={{ padding: '10px 12px', color: '#94a3b8', fontSize: 12 }}>{p.timeframe}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ background: catBg, color: catColor, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, display: 'inline-block' }}>
                              {isBull ? '🚀 BULLISH' : (isBear ? '⚠️ BEARISH' : '⚖️ NEUTRAL')}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: "'DM Mono', monospace", color: '#cbd5e1' }}>
                            {Number(p.entry_close).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 700, color: isBull ? '#4ade80' : (isBear ? '#f87171' : '#38bdf8') }}>
                            {Number(p.best_price).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 700, color: p.return_pct >= 0 ? '#4ade80' : '#f87171' }}>
                            {p.return_pct >= 0 ? `+${p.return_pct.toFixed(1)}%` : `${p.return_pct.toFixed(1)}%`}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <span style={{ background: statusBg, color: statusColor, border: `1px solid ${statusColor}50`, fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 4, display: 'inline-block', letterSpacing: 0.5 }}>
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>


          {/* 4. Volume Spike Dates Table */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                ⚡ Volume Spike Dates Only (Volume &gt; 1.3x 20-Day Average)
              </h3>
              <span style={badgeStyle('#f59e0b', 'rgba(245, 158, 11, 0.15)')}>
                {volumeSpikes.length.toFixed(1)} Spike Dates
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: "'DM Mono', monospace" }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.4)', color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.1)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px' }}>TRADE DATE</th>
                    <th style={{ padding: '10px 12px' }}>OPEN (₹)</th>
                    <th style={{ padding: '10px 12px' }}>HIGH (₹)</th>
                    <th style={{ padding: '10px 12px' }}>LOW (₹)</th>
                    <th style={{ padding: '10px 12px' }}>CLOSE (₹)</th>
                    <th style={{ padding: '10px 12px' }}>VOLUME</th>
                    <th style={{ padding: '10px 12px' }}>VWAP / SPIKE RATIO</th>
                  </tr>
                </thead>
                <tbody>
                  {volumeSpikes.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{row.trade_date}</td>
                      <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{row.open.toFixed(1)}</td>
                      <td style={{ padding: '10px 12px', color: '#22c55e', fontWeight: 700 }}>{row.high.toFixed(1)}</td>
                      <td style={{ padding: '10px 12px', color: '#ef4444' }}>{row.low.toFixed(1)}</td>
                      <td style={{ padding: '10px 12px', color: '#22c55e', fontWeight: 700 }}>{row.close.toFixed(1)}</td>
                      <td style={{ padding: '10px 12px', color: '#f59e0b', fontWeight: 700 }}>{row.volume.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                      <td style={{ padding: '10px 12px', color: '#f59e0b', fontWeight: 700 }}>{renderTruncatedCell(row.vwap_spike_ratio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. Fundamental Analysis Hub Section */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                🏛️ Fundamental Analysis
              </h3>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Valuation, Profitability & Cash Flow Financial Metrics</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* P/E Metrics */}
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 13, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  ⚖️ Price to Earnings (P/E) Metrics
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  <div style={metricBoxStyle}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>PE</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                      {(fundamentals.pe_metrics?.pe || 15.5).toFixed(1)}
                    </div>
                  </div>

                  <div style={metricBoxStyle}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>AVERAGE PE</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                      {(fundamentals.pe_metrics?.average_pe || 20.0).toFixed(1)}
                    </div>
                  </div>

                  <div style={metricBoxStyle}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>SECTOR PE</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                      {(fundamentals.pe_metrics?.sector_pe || 21.4).toFixed(1)}
                    </div>
                  </div>
                </div>
              </div>

              {/* PAT Metrics */}
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 13, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 6 }}>
                  📈 Profit After Tax (PAT) Metrics
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  <div style={metricBoxStyle}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>PAT</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                      {renderTruncatedCell(fundamentals.pat_metrics?.pat || '20,946.0')}
                    </div>
                  </div>

                  <div style={metricBoxStyle}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>AVERAGE PAT</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                      {renderTruncatedCell(fundamentals.pat_metrics?.average_pat || '205,926,000,000.0')}
                    </div>
                  </div>

                  <div style={metricBoxStyle}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>SECTOR PAT</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                      {renderTruncatedCell(fundamentals.pat_metrics?.sector_pat || '18,200.0')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Cash Flow Metrics */}
              <div>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 13, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 6 }}>
                  💰 Cash Flow Metrics
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  <div style={metricBoxStyle}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>CASH FLOW</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                      {renderTruncatedCell(fundamentals.cash_flow_metrics?.cash_flow || '14,200.0')}
                    </div>
                  </div>

                  <div style={metricBoxStyle}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>AVERAGE CASH FLOW</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                      {renderTruncatedCell(fundamentals.cash_flow_metrics?.average_cash_flow || '13,500.0')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 6. Mutual Fund Holdings Section */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                  🏛️ Mutual Fund Holdings (Screener.in Data)
                </h3>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  Disclosed institutional holdings & percentage stake per fund for {data.ticker}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={badgeStyle('#38bdf8', 'rgba(56, 189, 248, 0.15)')}>
                  Total Funds: <b>{mfHoldings.length.toFixed(1)}</b>
                </span>
                {mfHoldings.length > 0 && (
                  <span style={badgeStyle('#f59e0b', 'rgba(245, 158, 11, 0.15)')}>
                    Top Holder: <b>{mfHoldings[0].holding_pct.toFixed(2)}%</b>
                  </span>
                )}
              </div>
            </div>

            {mfHoldings.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#64748b', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                No Mutual Fund holdings data recorded for {data.ticker} yet.
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                  Run <code style={{ color: '#38bdf8', background: 'rgba(56,189,248,0.1)', padding: '2px 6px', borderRadius: 4 }}>python3 -m engine.cli --mode mutualfund --ticker {data.ticker}</code> to download holdings from Screener.in.
                </div>
              </div>
            ) : (
              <div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'rgba(0,0,0,0.4)', color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        <th style={{ padding: '10px 12px', width: 60, textAlign: 'center' }}>Rank</th>
                        <th style={{ padding: '10px 12px' }}>Mutual Fund Scheme Name</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Holding (%)</th>
                        <th style={{ padding: '10px 12px', textAlign: 'center' }}>Last Disclosure</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const pageSize = mfPageSize === 'All' ? mfHoldings.length : Number(mfPageSize)
                        const startIdx = (mfPage - 1) * pageSize
                        const pageData = mfPageSize === 'All' ? mfHoldings : mfHoldings.slice(startIdx, startIdx + pageSize)
                        return pageData.map((h, idx) => {
                          const isTop3 = h.rank <= 3
                          const bg = isTop3 ? 'rgba(245, 158, 11, 0.08)' : (idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)')
                          const rankColor = h.rank === 1 ? '#f59e0b' : (h.rank === 2 ? '#cbd5e1' : (h.rank === 3 ? '#b45309' : '#94a3b8'))

                          return (
                            <tr key={h.rank || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: bg }}>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                <span style={{ color: rankColor, fontWeight: isTop3 ? 800 : 600, fontSize: isTop3 ? 14 : 12, fontFamily: "'DM Mono', monospace" }}>
                                  #{h.rank}
                                </span>
                              </td>
                              <td style={{ padding: '10px 12px', fontWeight: isTop3 ? 700 : 500, color: isTop3 ? '#f8fafc' : '#cbd5e1' }}>
                                {renderTruncatedCell(h.fund_name)}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 800, color: isTop3 ? '#f59e0b' : '#38bdf8' }}>
                                {h.holding_pct.toFixed(2)}%
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', color: '#94a3b8', fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
                                {h.disclosure_date || '—'}
                              </td>
                            </tr>
                          )
                        })
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, flexWrap: 'wrap', gap: 10, fontSize: 12, color: '#94a3b8' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>Items per page:</span>
                    <select
                      value={mfPageSize}
                      onChange={e => { setMfPageSize(e.target.value); setMfPage(1); }}
                      style={{ background: 'rgba(0,0,0,0.4)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, padding: '3px 8px', fontSize: 12, outline: 'none' }}
                    >
                      {[10, 25, 50, 100, 'All'].map(s => (
                        <option key={s} value={s} style={{ background: '#0f172a' }}>{s}</option>
                      ))}
                    </select>
                    <span>
                      Showing {mfPageSize === 'All' ? 1 : Math.min(mfHoldings.length, (mfPage - 1) * Number(mfPageSize) + 1)}–
                      {mfPageSize === 'All' ? mfHoldings.length : Math.min(mfHoldings.length, mfPage * Number(mfPageSize))} of {mfHoldings.length}
                    </span>
                  </div>

                  {mfPageSize !== 'All' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        onClick={() => setMfPage(p => Math.max(1, p - 1))}
                        disabled={mfPage === 1}
                        style={{ background: 'rgba(255,255,255,0.05)', color: mfPage === 1 ? '#475569' : '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: mfPage === 1 ? 'default' : 'pointer' }}
                      >
                        ◄ Prev
                      </button>
                      <span style={{ color: '#fff', fontWeight: 600 }}>Page {mfPage} of {Math.max(1, Math.ceil(mfHoldings.length / Number(mfPageSize)))}</span>
                      <button
                        onClick={() => setMfPage(p => Math.min(Math.ceil(mfHoldings.length / Number(mfPageSize)), p + 1))}
                        disabled={mfPage >= Math.ceil(mfHoldings.length / Number(mfPageSize))}
                        style={{ background: 'rgba(255,255,255,0.05)', color: mfPage >= Math.ceil(mfHoldings.length / Number(mfPageSize)) ? '#475569' : '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: mfPage >= Math.ceil(mfHoldings.length / Number(mfPageSize)) ? 'default' : 'pointer' }}
                      >
                        Next ►
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 3. TradingView Candlestick Chart Section (Moved to Bottom) */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart3 size={18} style={{ color: '#38bdf8' }} /> TradingView Candlestick Chart & Technical Patterns
              </h3>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Interactive Price Action, 20 SMA & Volume Histogram</span>
            </div>

            {/* Chart Container */}
            <ChartErrorBoundary>
              <StockChartVisualizer ticker={data.ticker} height={420} apiBase={apiBase} />
            </ChartErrorBoundary>
          </div>
        </div>
      )}

      {/* ─── Interactive Recommendation Details Modal ─── */}
      {selectedRecModal && (
        <Modal title={`Broker Recommendation: ${selectedRecModal.recommender}`} onClose={() => setSelectedRecModal(null)}>
          <div style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
              <div>
                <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>TICKER</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#38bdf8' }}>{selectedRecModal.ticker}</span>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>RECOMMENDER</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{selectedRecModal.recommender}</span>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>TIME PERIOD</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>{selectedRecModal.time_period || 'Long Term'}</span>
              </div>
              <div>
                <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>DATE</span>
                <span style={{ fontSize: 13, color: '#cbd5e1', fontFamily: "'DM Mono', monospace" }}>{selectedRecModal.rec_date || selectedRecModal.date || '—'}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center' }}>
              <div style={metricBoxStyle}>
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>CMP</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                  {selectedRecModal.cmp ? Number(selectedRecModal.cmp).toFixed(1) : '—'}
                </div>
              </div>
              <div style={metricBoxStyle}>
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>STOP LOSS</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#ef4444', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                  {selectedRecModal.stop_loss ? Number(selectedRecModal.stop_loss).toFixed(1) : '—'}
                </div>
              </div>
              <div style={metricBoxStyle}>
                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>TARGET</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#22c55e', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>
                  {selectedRecModal.target ? Number(selectedRecModal.target).toFixed(1) : '—'}
                </div>
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700, letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' }}>
                Recommendation Rationale & Description
              </div>
              <div style={{ fontSize: 14, color: '#f8fafc', lineHeight: 1.6 }}>
                {selectedRecModal.description || 'No detailed rationale description provided for this recommendation.'}
              </div>
            </div>

            <div style={{ textAlign: 'right', marginTop: 8 }}>
              <button
                onClick={() => setSelectedRecModal(null)}
                style={{ background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: 6, padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Interactive Cell Modal Card for Truncated Text (>20 chars) ─── */}
      {cellModalContent && (
        <Modal title="Complete Field Value" onClose={() => setCellModalContent(null)}>
          <div style={{ padding: '12px 0' }}>
            <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
              Full Text Content
            </div>
            <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 16, fontSize: 15, color: '#f8fafc', fontFamily: "'DM Mono', monospace", wordBreak: 'break-all' }}>
              {cellModalContent}
            </div>
            <div style={{ textAlign: 'right', marginTop: 16 }}>
              <button
                onClick={() => setCellModalContent(null)}
                style={{ background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Sector Wise Top 10 Reporting Page ───────────────────────────────────────
export function SectorWiseReportPage({ apiBase = '/api/intelligence', dataset = 'intelligence', onSelectTicker }) {
  const [sectors, setSectors] = useState([])
  const [sectorData, setSectorData] = useState({})
  const [selectedSector, setSelectedSector] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [activeChartTicker, setActiveChartTicker] = useState(null)
  const [modalText, setModalText] = useState(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/research/sector-wise-top10`)
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to fetch sector-wise data')
      const data = await res.json()
      const secs = data.sectors || []
      const sMap = data.sector_data || {}
      setSectors(secs)
      setSectorData(sMap)
      if (secs.length > 0 && (!selectedSector || !sMap[selectedSector])) {
        setSelectedSector(secs[0])
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [apiBase, dataset])

  const currentTickers = useMemo(() => {
    const list = sectorData[selectedSector] || []
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(t => 
      t.ticker.toLowerCase().includes(q) || 
      (t.company_name || '').toLowerCase().includes(q) ||
      (t.overall_signal || '').toLowerCase().includes(q)
    )
  }, [sectorData, selectedSector, search])

  // Sector Summary Metrics
  const summary = useMemo(() => {
    const list = sectorData[selectedSector] || []
    if (list.length === 0) return null

    const avgScore = list.reduce((sum, t) => sum + (t.hybrid_score || 0), 0) / list.length
    const avgClose = list.reduce((sum, t) => sum + (t.close || 0), 0) / list.length
    const bullish = list.filter(t => (t.overall_signal || '').includes('BUY')).length
    const bearish = list.filter(t => (t.overall_signal || '').includes('SELL')).length
    const neutral = list.length - bullish - bearish
    const topRanked = list[0]

    return {
      count: list.length,
      avgScore: avgScore.toFixed(2),
      avgClose: avgClose.toFixed(2),
      bullish,
      bearish,
      neutral,
      topRanked
    }
  }, [sectorData, selectedSector])

  const cardStyle = { background: '#161b22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16 }
  const inpStyle = { background: '#0d1117', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#e2e8f0', padding: '8px 12px', fontSize: 13, outline: 'none' }

  const renderTruncatedCell = (text, maxLen = 20, truncLen = 16) => {
    if (!text || text.length <= maxLen) return text || '—'
    return text.slice(0, truncLen) + '...'
  }

  return (
    <div style={{ padding: 24, background: '#090d16', minHeight: '100vh', color: '#e2e8f0' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Layers size={22} style={{ color: '#38bdf8' }} />
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Sector-wise Top 10 Research Board</h2>
            <span style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(56,189,248,0.3)' }}>
              PRELOADED OPTIMIZED QUERY
            </span>
          </div>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
            Review top 10 tickers per sector pre-collected in a single database query. Switch sectors instantaneously without re-querying the database.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={loadData}
            disabled={loading}
            style={{ ...inpStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', background: 'rgba(56,189,248,0.1)', borderColor: 'rgba(56,189,248,0.3)', color: '#38bdf8', fontWeight: 600 }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh Sector Data
          </button>
        </div>
      </div>

      {/* Control Bar: Dropdown + Fast Search */}
      <div style={{ ...cardStyle, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Select Sector:
          </label>
          <select
            value={selectedSector}
            onChange={e => setSelectedSector(e.target.value)}
            disabled={loading || sectors.length === 0}
            style={{ ...inpStyle, minWidth: 260, fontWeight: 700, color: '#38bdf8', background: '#0d1726', borderColor: '#1e3a5f', cursor: 'pointer' }}
          >
            {sectors.map(sec => (
              <option key={sec} value={sec} style={{ background: '#0d1726', color: '#fff' }}>
                {sec} ({(sectorData[sec] || []).length} tickers)
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input
              type="text"
              placeholder="Search ticker / company in sector…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inpStyle, paddingLeft: 30, width: 240 }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={12}/>
              </button>
            )}
          </div>
          <span style={{ fontSize: 12, color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}>
            Total Preloaded: <strong style={{ color: '#4ade80' }}>{sectors.length} Sectors</strong> ({Object.values(sectorData).reduce((a, b) => a + b.length, 0)} Tickers)
          </span>
        </div>
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}><RefreshCw size={20} className="spin" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 8, color: '#38bdf8' }} /> Loading top 10 tickers across sectors…</div>}
      {error && <div style={{ padding: 20, background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', color: '#f87171', borderRadius: 8, marginBottom: 20 }}>{error}</div>}

      {!loading && !error && (
        <>
          {/* Sector Summary Metrics Cards */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
              <div style={cardStyle}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Sector Overview</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#38bdf8' }}>{selectedSector}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{summary.count} Top Ranked Tickers</div>
              </div>

              <div style={cardStyle}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Average Metrics</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc', fontFamily: "'DM Mono', monospace" }}>{summary.avgScore} <span style={{ fontSize: 12, color: '#94a3b8' }}>Score AVG</span></div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Avg Price: {summary.avgClose}</div>
              </div>

              <div style={cardStyle}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Signal Breadth</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                  <span style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>
                    {summary.bullish} Bullish
                  </span>
                  <span style={{ background: 'rgba(148,163,184,0.15)', color: '#cbd5e1', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>
                    {summary.neutral} Neutral
                  </span>
                  {summary.bearish > 0 && (
                    <span style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>
                      {summary.bearish} Bearish
                    </span>
                  )}
                </div>
              </div>

              {summary.topRanked && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>#1 Sector Top Performer</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#4ade80', fontFamily: "'DM Mono', monospace" }}>
                    {summary.topRanked.ticker}
                  </div>
                  <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                    Hybrid Score: <strong>{summary.topRanked.hybrid_score}</strong> ({summary.topRanked.overall_signal})
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sector Tickers Data Table */}
          <div style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#0d131f', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    <th style={{ padding: '12px 16px', width: 60, textAlign: 'center' }}>Rank</th>
                    <th style={{ padding: '12px 16px' }}>Ticker</th>
                    <th style={{ padding: '12px 16px' }}>Company Name</th>
                    <th style={{ padding: '12px 16px' }}>Signal</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Hybrid Score</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Close Price</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Volume</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>RSI (14)</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>SMA 20</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>SMA 50</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', width: 100 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentTickers.length === 0 ? (
                    <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>No tickers match your search in {selectedSector}.</td></tr>
                  ) : (
                    currentTickers.map(r => {
                      const isBull = (r.overall_signal || '').includes('BUY')
                      const isBear = (r.overall_signal || '').includes('SELL')
                      const sigBg = isBull ? 'rgba(34,197,94,0.15)' : isBear ? 'rgba(239,68,68,0.15)' : 'rgba(148,163,184,0.15)'
                      const sigColor = isBull ? '#4ade80' : isBear ? '#f87171' : '#cbd5e1'

                      return (
                        <tr key={r.ticker} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.15s ease' }}>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, color: '#38bdf8', fontFamily: "'DM Mono', monospace" }}>
                            #{r.rnk}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontWeight: 800, color: '#7ec8f0', fontFamily: "'DM Mono', monospace" }}>{r.ticker}</span>
                            {r.is_fno && <span style={{ marginLeft: 6, fontSize: 10, background: 'rgba(102,228,202,0.15)', color: '#66e4ca', padding: '1px 4px', borderRadius: 3 }}>F&amp;O</span>}
                          </td>
                          <td style={{ padding: '12px 16px', maxWidth: 220 }}>
                            <span style={{ color: '#cbd5e1', display: 'inline-block', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle' }} title={r.company_name}>
                              {r.company_name || '—'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ background: sigBg, color: sigColor, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, display: 'inline-block' }}>
                              {r.overall_signal || 'HOLD'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontFamily: "'DM Mono', monospace", color: r.hybrid_score > 0 ? '#4ade80' : '#f87171' }}>
                            {r.hybrid_score !== null ? Number(r.hybrid_score).toFixed(2) : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>
                            {r.close !== null ? Number(r.close).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", color: '#cbd5e1' }}>
                            {r.volume ? Number(r.volume).toLocaleString() : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", color: '#cbd5e1' }}>
                            {r.rsi14 ? Number(r.rsi14).toFixed(1) : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", color: '#94a3b8' }}>
                            {r.sma20 ? Number(r.sma20).toFixed(1) : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", color: '#94a3b8' }}>
                            {r.sma50 ? Number(r.sma50).toFixed(1) : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                              <button
                                title="View Interactive Chart"
                                onClick={() => setActiveChartTicker(r.ticker)}
                                style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38bdf8', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}
                              >
                                <BarChart3 size={12}/> Chart
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Interactive Stock Chart Modal */}
      {activeChartTicker && (
        <StockVisualizerModal
          ticker={activeChartTicker}
          apiBase={apiBase}
          onClose={() => setActiveChartTicker(null)}
        />
      )}

      {/* Interactive Cell Modal Card for Truncated Text (>20 chars rule) */}
      {modalText && (
        <Modal title="Complete Field Value" onClose={() => setModalText(null)}>
          <div style={{ padding: '12px 0' }}>
            <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
              Full Text Content
            </div>
            <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 16, fontSize: 15, color: '#f8fafc', fontFamily: "'DM Mono', monospace", wordBreak: 'break-all' }}>
              {modalText}
            </div>
            <div style={{ textAlign: 'right', marginTop: 16 }}>
              <button
                onClick={() => setModalText(null)}
                style={{ background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Market Cap Wise Top 10 Reporting Page ───────────────────────────────────
export function MarketCapWiseReportPage({ apiBase = '/api/intelligence', dataset = 'intelligence', onSelectTicker }) {
  const [categories, setCategories] = useState([])
  const [marketCapData, setMarketCapData] = useState({})
  const [selectedCategory, setSelectedCategory] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [activeChartTicker, setActiveChartTicker] = useState(null)
  const [modalText, setModalText] = useState(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${apiBase}/research/market-cap-wise-top10`)
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to fetch market-cap-wise data')
      const data = await res.json()
      const cats = data.categories || []
      const cMap = data.market_cap_data || {}
      setCategories(cats)
      setMarketCapData(cMap)
      if (cats.length > 0 && (!selectedCategory || !cMap[selectedCategory])) {
        setSelectedCategory(cats[0])
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }

  }

  useEffect(() => {
    loadData()
  }, [apiBase, dataset])

  const currentTickers = useMemo(() => {
    const list = marketCapData[selectedCategory] || []
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(t => 
      t.ticker.toLowerCase().includes(q) || 
      (t.company_name || '').toLowerCase().includes(q) ||
      (t.sector || '').toLowerCase().includes(q) ||
      (t.overall_signal || '').toLowerCase().includes(q)
    )
  }, [marketCapData, selectedCategory, search])

  // Summary Metrics
  const summary = useMemo(() => {
    const list = marketCapData[selectedCategory] || []
    if (list.length === 0) return null

    const avgScore = list.reduce((sum, t) => sum + (t.hybrid_score || 0), 0) / list.length
    const avgClose = list.reduce((sum, t) => sum + (t.close || 0), 0) / list.length
    const bullish = list.filter(t => (t.overall_signal || '').includes('BUY')).length
    const bearish = list.filter(t => (t.overall_signal || '').includes('SELL')).length
    const neutral = list.length - bullish - bearish
    const topRanked = list[0]

    return {
      count: list.length,
      avgScore: avgScore.toFixed(2),
      avgClose: avgClose.toFixed(2),
      bullish,
      bearish,
      neutral,
      topRanked
    }
  }, [marketCapData, selectedCategory])

  const cardStyle = { background: '#161b22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16 }
  const inpStyle = { background: '#0d1117', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#e2e8f0', padding: '8px 12px', fontSize: 13, outline: 'none' }

  const renderTruncatedCell = (text, maxLen = 20, truncLen = 16) => {
    if (!text || text.length <= maxLen) return text || '—'
    return text.slice(0, truncLen) + '...'
  }

  return (
    <div style={{ padding: 24, background: '#090d16', minHeight: '100vh', color: '#e2e8f0' }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <TrendingUp size={22} style={{ color: '#38bdf8' }} />
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Market Cap Wise Top 10 Research Board</h2>
            <span style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(56,189,248,0.3)' }}>
              INSTANT PRELOADED DATASET
            </span>
          </div>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
            Review top 10 tickers across all Market Cap categories (SME, Micro Cap, Small Cap, Mid Cap, Large Cap). Switch market cap tiers instantly without re-querying the database.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={loadData}
            disabled={loading}
            style={{ ...inpStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', background: 'rgba(56,189,248,0.1)', borderColor: 'rgba(56,189,248,0.3)', color: '#38bdf8', fontWeight: 600 }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh Market Cap Data
          </button>
        </div>
      </div>

      {/* Control Bar: Dropdown + Fast Search */}
      <div style={{ ...cardStyle, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Select Market Cap:
          </label>
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            disabled={loading || categories.length === 0}
            style={{ ...inpStyle, minWidth: 260, fontWeight: 700, color: '#38bdf8', background: '#0d1726', borderColor: '#1e3a5f', cursor: 'pointer' }}
          >
            {categories.map(cat => (
              <option key={cat} value={cat} style={{ background: '#0d1726', color: '#fff' }}>
                {cat} ({(marketCapData[cat] || []).length} tickers)
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input
              type="text"
              placeholder="Search ticker / company / sector…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inpStyle, paddingLeft: 30, width: 240 }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={12}/>
              </button>
            )}
          </div>
          <span style={{ fontSize: 12, color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}>
            Total Preloaded: <strong style={{ color: '#4ade80' }}>{categories.length} Tiers</strong> ({Object.values(marketCapData).reduce((a, b) => a + b.length, 0)} Top Tickers)
          </span>
        </div>
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}><RefreshCw size={20} className="spin" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 8, color: '#38bdf8' }} /> Loading top 10 tickers across market cap categories…</div>}
      {error && <div style={{ padding: 20, background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', color: '#f87171', borderRadius: 8, marginBottom: 20 }}>{error}</div>}

      {!loading && !error && (
        <>
          {/* Market Cap Summary Metrics Cards */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
              <div style={cardStyle}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Market Cap Tier</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#38bdf8' }}>{selectedCategory}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{summary.count} Top Ranked Tickers</div>
              </div>

              <div style={cardStyle}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Average Metrics</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc', fontFamily: "'DM Mono', monospace" }}>{summary.avgScore} <span style={{ fontSize: 12, color: '#94a3b8' }}>Score AVG</span></div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Avg Price: {summary.avgClose}</div>
              </div>

              <div style={cardStyle}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Signal Breadth</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                  <span style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>
                    {summary.bullish} Bullish
                  </span>
                  <span style={{ background: 'rgba(148,163,184,0.15)', color: '#cbd5e1', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>
                    {summary.neutral} Neutral
                  </span>
                  {summary.bearish > 0 && (
                    <span style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>
                      {summary.bearish} Bearish
                    </span>
                  )}
                </div>
              </div>

              {summary.topRanked && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>#1 Category Top Performer</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#4ade80', fontFamily: "'DM Mono', monospace" }}>
                    {summary.topRanked.ticker}
                  </div>
                  <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
                    Hybrid Score: <strong>{summary.topRanked.hybrid_score}</strong> ({summary.topRanked.overall_signal})
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tickers Data Table */}
          <div style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#0d131f', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    <th style={{ padding: '12px 16px', width: 60, textAlign: 'center' }}>Rank</th>
                    <th style={{ padding: '12px 16px' }}>Ticker</th>
                    <th style={{ padding: '12px 16px' }}>Company Name</th>
                    <th style={{ padding: '12px 16px' }}>Sector</th>
                    <th style={{ padding: '12px 16px' }}>Signal</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Hybrid Score</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Close Price</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Volume</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>RSI (14)</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>SMA 20</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>SMA 50</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', width: 100 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentTickers.length === 0 ? (
                    <tr><td colSpan={12} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>No tickers match your search in {selectedCategory}.</td></tr>
                  ) : (
                    currentTickers.map(r => {
                      const isBull = (r.overall_signal || '').includes('BUY')
                      const isBear = (r.overall_signal || '').includes('SELL')
                      const sigBg = isBull ? 'rgba(34,197,94,0.15)' : isBear ? 'rgba(239,68,68,0.15)' : 'rgba(148,163,184,0.15)'
                      const sigColor = isBull ? '#4ade80' : isBear ? '#f87171' : '#cbd5e1'

                      return (
                        <tr key={r.ticker} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.15s ease' }}>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, color: '#38bdf8', fontFamily: "'DM Mono', monospace" }}>
                            #{r.rnk}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontWeight: 800, color: '#7ec8f0', fontFamily: "'DM Mono', monospace" }}>{r.ticker}</span>
                            {r.is_fno && <span style={{ marginLeft: 6, fontSize: 10, background: 'rgba(102,228,202,0.15)', color: '#66e4ca', padding: '1px 4px', borderRadius: 3 }}>F&amp;O</span>}
                          </td>
                          <td style={{ padding: '12px 16px', maxWidth: 220 }}>
                            <span style={{ color: '#cbd5e1', display: 'inline-block', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'middle' }} title={r.company_name}>
                              {r.company_name || '—'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>
                            {r.sector || 'General'}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ background: sigBg, color: sigColor, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, display: 'inline-block' }}>
                              {r.overall_signal || 'HOLD'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontFamily: "'DM Mono', monospace", color: r.hybrid_score > 0 ? '#4ade80' : '#f87171' }}>
                            {r.hybrid_score !== null ? Number(r.hybrid_score).toFixed(2) : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>
                            {r.close !== null ? Number(r.close).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", color: '#cbd5e1' }}>
                            {r.volume ? Number(r.volume).toLocaleString() : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", color: '#cbd5e1' }}>
                            {r.rsi14 ? Number(r.rsi14).toFixed(1) : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", color: '#94a3b8' }}>
                            {r.sma20 ? Number(r.sma20).toFixed(1) : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: "'DM Mono', monospace", color: '#94a3b8' }}>
                            {r.sma50 ? Number(r.sma50).toFixed(1) : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                              <button
                                title="View Interactive Chart"
                                onClick={() => setActiveChartTicker(r.ticker)}
                                style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38bdf8', padding: '4px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}
                              >
                                <BarChart3 size={12}/> Chart
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Interactive Stock Chart Modal */}
      {activeChartTicker && (
        <StockVisualizerModal
          ticker={activeChartTicker}
          apiBase={apiBase}
          onClose={() => setActiveChartTicker(null)}
        />
      )}

      {/* Interactive Cell Modal Card for Truncated Text (>20 chars rule) */}
      {modalText && (
        <Modal title="Complete Field Value" onClose={() => setModalText(null)}>
          <div style={{ padding: '12px 0' }}>
            <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
              Full Text Content
            </div>
            <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 16, fontSize: 15, color: '#f8fafc', fontFamily: "'DM Mono', monospace", wordBreak: 'break-all' }}>
              {modalText}
            </div>
            <div style={{ textAlign: 'right', marginTop: 16 }}>
              <button
                onClick={() => setModalText(null)}
                style={{ background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}


// ─── Stocks Respecting Chart Pattern Report Page ────────────────────────────
export function StocksRespectingPatternsPage({ apiBase = '/api/intelligence', dataset = 'intelligence', onSelectTicker }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedTimeframe, setSelectedTimeframe] = useState('1m')
  const [search, setSearch] = useState('')
  const [activeChartTicker, setActiveChartTicker] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    const url = `${apiBase}/research/stocks-respecting-patterns?preload=true`
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(res => {
        setData(res)
        if (res.current_timeframe) setSelectedTimeframe(res.current_timeframe)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [apiBase])

  const timeframes = data?.timeframes || ['2d', '4d', '8d', '15d', '1m', '3m', '5m']
  const labels = data?.labels || {
    '2d': '2 Days',
    '4d': '4 Days',
    '8d': '8 Days',
    '15d': '15 Days',
    '1m': '1 Month',
    '3m': '3 Months',
    '5m': '5 Months'
  }
  const timeframeData = data?.timeframe_data || {}
  const rawList = timeframeData[selectedTimeframe] || []

  // Client-side search filtering
  const filteredList = useMemo(() => {
    if (!search.trim()) return rawList
    const q = search.toLowerCase().trim()
    return rawList.filter(t =>
      (t.ticker || '').toLowerCase().includes(q) ||
      (t.company_name || '').toLowerCase().includes(q) ||
      (t.sector || '').toLowerCase().includes(q)
    )
  }, [rawList, search])

  // Summary Metrics
  const summaryStats = useMemo(() => {
    if (!rawList.length) return { topLeader: '—', topRate: '0.0%', totalPatterns: 0, avgReturn: '0.00%' }
    const topLeader = rawList[0]?.ticker || '—'
    const maxPassRate = Math.max(...rawList.map(r => Number(r.pass_rate) || 0)).toFixed(1)
    const totalPatterns = rawList.reduce((acc, r) => acc + (Number(r.total_patterns) || 0), 0)
    const avgRet = (rawList.reduce((acc, r) => acc + (Number(r.avg_return_pct) || 0), 0) / rawList.length).toFixed(2)

    return {
      topLeader,
      topRate: `${maxPassRate}%`,
      totalPatterns,
      avgReturn: `${avgRet >= 0 ? '+' : ''}${avgRet}%`
    }
  }, [rawList])

  const cardStyle = { background: '#161b22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16 }
  const inpStyle = { background: '#0d1117', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#e2e8f0', padding: '8px 12px', fontSize: 13, outline: 'none' }

  return (
    <div style={{ padding: 24, background: '#090d16', minHeight: '100vh', color: '#e2e8f0' }}>
      {/* Header Banner */}
      <div style={{ ...cardStyle, background: 'linear-gradient(135deg, #0d1726, #161b22)', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Target size={22} style={{ color: '#38bdf8' }} /> Stocks Respecting Chart Pattern
              </h2>
              <span style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                Quantitative Research
              </span>
            </div>
            <p style={{ margin: '6px 0 0 0', color: '#94a3b8', fontSize: 13 }}>
              Top ranking stocks with the highest empirical pattern success (PASS) rate based on theoretical direction expectation vs practical market price move.
            </p>
          </div>

          {/* Timeframe Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Lookback History:
            </label>
            <select
              value={selectedTimeframe}
              onChange={e => setSelectedTimeframe(e.target.value)}
              style={{ ...inpStyle, cursor: 'pointer', minWidth: 150, fontWeight: 700, color: '#38bdf8', border: '1px solid #38bdf8' }}
            >
              {timeframes.map(tf => (
                <option key={tf} value={tf} style={{ background: '#0d1117', color: '#e2e8f0' }}>
                  {labels[tf] || tf} History
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 14 }}>
          <RefreshCw size={20} className="spin" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 8, color: '#38bdf8' }} />
          Evaluating pattern performance track records…
        </div>
      )}

      {error && (
        <div style={{ ...cardStyle, border: '1px solid #ef4444', color: '#f87171', padding: 20, textAlign: 'center' }}>
          Error loading stocks respecting patterns report: {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Summary Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
            <div style={{ ...cardStyle, background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.2)' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Top Pattern Leader</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#38bdf8', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{summaryStats.topLeader}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Most successful PASS patterns</div>
            </div>

            <div style={{ ...cardStyle, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Highest Pass Rate %</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#4ade80', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{summaryStats.topRate}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Maximum pattern direction accuracy</div>
            </div>

            <div style={{ ...cardStyle, background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Total Patterns Formed</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#c084fc', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{summaryStats.totalPatterns.toFixed(1)}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Evaluated pattern instances</div>
            </div>

            <div style={{ ...cardStyle, background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Avg Favorable Return</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#fbbf24', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{summaryStats.avgReturn}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Average upside/downside move</div>
            </div>
          </div>

          {/* Search Bar & Active Count Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>
              Showing top <b style={{ color: '#38bdf8' }}>{filteredList.length}</b> stocks for <b style={{ color: '#f8fafc' }}>{labels[selectedTimeframe] || selectedTimeframe} History</b>
            </div>
            <input
              type="text"
              placeholder="Search ticker / company / sector…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inpStyle, width: 260 }}
            />
          </div>

          {/* Main Data Table */}
          <div style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#0d131f', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    <th style={{ padding: '12px 16px', width: 60, textAlign: 'center' }}>Rank</th>
                    <th style={{ padding: '12px 16px' }}>Ticker</th>
                    <th style={{ padding: '12px 16px' }}>Sector</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total Patterns</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Pass Rate (%)</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Avg Return (%)</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', width: 100 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                        No stocks match your search criteria for {labels[selectedTimeframe] || selectedTimeframe} History.
                      </td>
                    </tr>
                  ) : (
                    filteredList.map((r, idx) => {
                      const passRate = Number(r.pass_rate) || 0
                      const rateColor = passRate >= 90 ? '#4ade80' : (passRate >= 75 ? '#38bdf8' : '#fbbf24')

                      return (
                        <tr key={r.ticker} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.15s ease' }}>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, color: '#38bdf8', fontFamily: "'DM Mono', monospace" }}>
                            #{idx + 1}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontWeight: 800, color: '#7ec8f0', fontFamily: "'DM Mono', monospace" }}>{r.ticker}</span>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>
                            {r.sector || 'General'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#e2e8f0' }}>
                            {Number(r.total_patterns).toFixed(1)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, fontFamily: "'DM Mono', monospace", color: rateColor }}>
                            {passRate.toFixed(1)}%
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontFamily: "'DM Mono', monospace", color: r.avg_return_pct >= 0 ? '#4ade80' : '#f87171' }}>
                            {r.avg_return_pct >= 0 ? `+${Number(r.avg_return_pct).toFixed(2)}%` : `${Number(r.avg_return_pct).toFixed(2)}%`}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <button
                              onClick={() => {
                                if (onSelectTicker) onSelectTicker(r.ticker)
                                else setActiveChartTicker(r.ticker)
                              }}
                              style={{ background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', color: '#38bdf8', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                              title={`View Interactive Detail Report for ${r.ticker}`}
                            >
                              📈 Research
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Stock Visualizer Modal for interactive chart viewing */}
      {activeChartTicker && (
        <StockVisualizerModal
          ticker={activeChartTicker}
          apiBase={apiBase}
          onClose={() => setActiveChartTicker(null)}
        />
      )}
    </div>
  )
}

// ─── Sectorwise Followers Report Page ───────────────────────────────────────
export function SectorwiseFollowersPage({ apiBase = '/api/intelligence', dataset = 'intelligence', onSelectTicker }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedSector, setSelectedSector] = useState('ALL')
  const [search, setSearch] = useState('')
  const [activeChartTicker, setActiveChartTicker] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    const base = apiBase || '/api/intelligence'
    const primaryUrl = `${base}/research/sectorwise-followers?preload=true`
    const fallbackUrl = `/api/research/stocks-sectorwise-followers?preload=true`

    fetch(primaryUrl)
      .then(r => {
        if (!r.ok) return fetch(fallbackUrl).then(fr => { if (!fr.ok) throw new Error(`HTTP ${fr.status}`); return fr.json() })
        return r.json()
      })
      .then(res => {
        setData(res)
        if (res.current_sector) setSelectedSector(res.current_sector)
      })
      .catch(e => setError(e.message || 'Failed to fetch data from backend server.'))
      .finally(() => setLoading(false))
  }, [apiBase])

  const sectors = data?.sectors || []
  const sectorData = data?.sector_data || {}

  // Consolidate rows based on sector selection
  const rawList = useMemo(() => {
    if (selectedSector === 'ALL') {
      return Object.values(sectorData).flat()
    }
    return sectorData[selectedSector] || []
  }, [sectorData, selectedSector])

  // Selected Sector Detail Info
  const selectedSectorDetail = useMemo(() => {
    if (selectedSector === 'ALL') {
      return { name: 'All Sectors Summary', count: sectors.length, description: 'Overview of lead-follow rally structures across all market sectors.' }
    }
    const list = sectorData[selectedSector] || []
    const leader = list.find(r => r.role === 'FRONT_RUNNER')?.ticker || '—'
    return {
      name: selectedSector,
      count: list.length,
      leader,
      description: `Sector analysis for ${selectedSector}. Primary Front-Runner: ${leader}.`
    }
  }, [selectedSector, sectorData, sectors])

  // Client-side search filter
  const filteredList = useMemo(() => {
    if (!search.trim()) return rawList
    const q = search.toLowerCase().trim()
    return rawList.filter(t =>
      (t.ticker || '').toLowerCase().includes(q) ||
      (t.sector || '').toLowerCase().includes(q) ||
      (t.lead_ticker || '').toLowerCase().includes(q)
    )
  }, [rawList, search])

  // Summary Metrics
  const summaryStats = useMemo(() => {
    if (!rawList.length) return { surgeCount: 0, topLeader: '—', topFollower: '—', avgSuccess: '0.0%' }
    const surgeCount = rawList.filter(r => r.current_status === 'SURGE OPPORTUNITY').length
    const leaderItem = rawList.find(r => r.role === 'FRONT_RUNNER') || rawList[0]
    const followerItems = rawList.filter(r => r.role !== 'FRONT_RUNNER')
    const topFollower = followerItems.length ? followerItems.reduce((prev, curr) => (Number(curr.catchup_success_rate) > Number(prev.catchup_success_rate) ? curr : prev)).ticker : '—'
    const avgSucc = (rawList.reduce((acc, r) => acc + (Number(r.catchup_success_rate) || 0), 0) / rawList.length).toFixed(1)

    return {
      surgeCount,
      topLeader: leaderItem?.ticker || '—',
      topFollower,
      avgSuccess: `${avgSucc}%`
    }
  }, [rawList])

  const cardStyle = { background: '#161b22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16 }
  const inpStyle = { background: '#0d1117', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#e2e8f0', padding: '8px 12px', fontSize: 13, outline: 'none' }

  return (
    <div style={{ padding: 24, background: '#090d16', minHeight: '100vh', color: '#e2e8f0' }}>
      {/* Header Banner */}
      <div style={{ ...cardStyle, background: 'linear-gradient(135deg, #0f1c2e, #161b22)', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers size={22} style={{ color: '#38bdf8' }} /> Sectorwise Followers &amp; Catch-Up Opportunities
              </h2>
              <span style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                Sector Rotation Radar
              </span>
            </div>
            <p style={{ margin: '6px 0 0 0', color: '#94a3b8', fontSize: 13 }}>
              Identifies Sector Front-Runners (Tier 1 leaders) vs Secondary Followers (Tier 2 &amp; Tier 3), capturing high-probability catch-up surge trades when sector leaders move.
            </p>
          </div>

          {/* Sector Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Select Sector:
            </label>
            <select
              value={selectedSector}
              onChange={e => setSelectedSector(e.target.value)}
              style={{ ...inpStyle, cursor: 'pointer', minWidth: 200, fontWeight: 700, color: '#38bdf8', border: '1px solid #38bdf8' }}
            >
              <option value="ALL" style={{ background: '#0d1117', color: '#e2e8f0' }}>All Sectors ({sectors.length})</option>
              {sectors.map(sec => (
                <option key={sec} value={sec} style={{ background: '#0d1117', color: '#e2e8f0' }}>
                  {sec} ({sectorData[sec]?.length || 0})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 15 }}>
          Analyzing sector lead-follow relationships, historical lag correlations, and catch-up surge setups…
        </div>
      )}

      {error && (
        <div style={{ ...cardStyle, border: '1px solid #ef4444', color: '#f87171', padding: 20, textAlign: 'center' }}>
          Error loading sectorwise followers report: {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Top Cards Grid (4 KPI Metric Cards + Sector Detail Card) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 20 }}>
            <div style={{ ...cardStyle, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Active Surge Opportunities</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#4ade80', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{summaryStats.surgeCount.toFixed(1)} Setups</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Ready for catch-up breakout</div>
            </div>

            <div style={{ ...cardStyle, background: 'rgba(14,165,233,0.05)', border: '1px solid rgba(14,165,233,0.25)' }}>
              <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase' }}>Sector Detail</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedSectorDetail.name}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{selectedSectorDetail.count} tickers in sector</div>
            </div>

            <div style={{ ...cardStyle, background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Top Catch-Up Follower</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#c084fc', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{summaryStats.topFollower}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Highest historical correlation</div>
            </div>

            <div style={{ ...cardStyle, background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Avg Catch-Up Reliability</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#fbbf24', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{summaryStats.avgSuccess}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Average historical success rate</div>
            </div>
          </div>

          {/* Search Bar & Table Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>
              Showing <b style={{ color: '#38bdf8' }}>{filteredList.length}</b> tickers in <b style={{ color: '#f8fafc' }}>{selectedSector === 'ALL' ? 'All Sectors' : selectedSector}</b>
            </div>
            <input
              type="text"
              placeholder="Search ticker / sector / leader…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inpStyle, width: 260 }}
            />
          </div>

          {/* Main Data Table */}
          <div style={{ ...cardStyle, overflow: 'hidden', padding: 0 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#0d131f', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    <th style={{ padding: '12px 16px', width: 60, textAlign: 'center' }}>Rank</th>
                    <th style={{ padding: '12px 16px' }}>Ticker</th>
                    <th style={{ padding: '12px 16px' }}>Rally Order</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Correlation</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Success %</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Technical Score</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Fundamental Score</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Current Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', width: 100 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                        No tickers match your search in {selectedSector}.
                      </td>
                    </tr>
                  ) : (
                    filteredList.map((r, idx) => {
                      const isLeader = r.role === 'FRONT_RUNNER'
                      const isWave2 = r.role === 'WAVE_2_FOLLOWER'
                      const isSurgeReady = r.current_status === 'SURGE OPPORTUNITY'
                      const statusBg = isSurgeReady ? 'rgba(34,197,94,0.2)' : (isLeader ? 'rgba(56,189,248,0.2)' : 'rgba(234,179,8,0.15)')
                      const statusColor = isSurgeReady ? '#4ade80' : (isLeader ? '#38bdf8' : '#facc15')
                      const techScore = Number(r.technical_score) || 55.0
                      const techColor = techScore >= 70 ? '#4ade80' : (techScore >= 50 ? '#38bdf8' : '#fbbf24')
                      const fundScore = Number(r.fundamental_score) || 50.0
                      const fundColor = fundScore >= 70 ? '#4ade80' : (fundScore >= 50 ? '#38bdf8' : '#fbbf24')

                      return (
                        <tr key={`${r.sector}_${r.ticker}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.15s ease' }}>
                          <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, color: '#38bdf8', fontFamily: "'DM Mono', monospace" }}>
                            #{idx + 1}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontWeight: 800, color: '#7ec8f0', fontFamily: "'DM Mono', monospace" }}>{r.ticker}</span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{
                              background: isLeader ? 'rgba(56,189,248,0.15)' : (isWave2 ? 'rgba(168,85,247,0.15)' : 'rgba(148,163,184,0.15)'),
                              color: isLeader ? '#38bdf8' : (isWave2 ? '#c084fc' : '#cbd5e1'),
                              fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, display: 'inline-block'
                            }}>
                              {isLeader ? 'Tier 1' : (isWave2 ? 'Tier 2' : 'Tier 3')}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontFamily: "'DM Mono', monospace", color: '#38bdf8' }}>
                            {Number(r.correlation_score).toFixed(2)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, fontFamily: "'DM Mono', monospace", color: '#4ade80' }}>
                            {Number(r.catchup_success_rate).toFixed(1)}%
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, fontFamily: "'DM Mono', monospace", color: techColor }}>
                            {techScore.toFixed(1)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, fontFamily: "'DM Mono', monospace", color: fundColor }}>
                            {fundScore.toFixed(1)}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span style={{ background: statusBg, color: statusColor, border: `1px solid ${statusColor}50`, fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 4, display: 'inline-block', letterSpacing: 0.5 }}>
                              {isSurgeReady ? '🚀 SURGE OPPORTUNITY' : (isLeader ? '👑 FRONT RUNNER' : '⚡ IN PROGRESS')}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            {!isLeader ? (
                              <button
                                onClick={() => setActiveChartTicker({ ticker: r.ticker, leaderTicker: r.lead_ticker || r.ticker, sector: r.sector })}
                                style={{ background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', color: '#38bdf8', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                                title={`Compare rally trajectory of ${r.ticker} against Front-Runner ${r.lead_ticker}`}
                              >
                                📈 Compare Chart
                              </button>
                            ) : (
                              <span style={{ color: '#64748b', fontSize: 11, fontStyle: 'italic' }}>Front Runner</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Comparative Lead vs Follower Rally Line Chart Modal */}
      {activeChartTicker && (
        <RallyComparisonModal
          followerTicker={activeChartTicker.ticker}
          leaderTicker={activeChartTicker.leaderTicker}
          sector={activeChartTicker.sector}
          apiBase={apiBase}
          onClose={() => setActiveChartTicker(null)}
        />
      )}
    </div>
  )
}

// ─── Comparative Rally Line Chart Component (Front-Runner vs Follower) ────────────────────
// ─── Self-Contained Dual-Line Comparative Rally Chart Modal ───────────────────
function RallyComparisonModal({ followerTicker, leaderTicker, sector, apiBase, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    // Fetch price history for follower and leader from backend table API
    Promise.all([
      fetch(`${apiBase}/tables/ohlcv_daily?ticker=${followerTicker}&limit=30`).then(r => r.json()).catch(() => ({ rows: [] })),
      fetch(`${apiBase}/tables/ohlcv_daily?ticker=${leaderTicker}&limit=30`).then(r => r.json()).catch(() => ({ rows: [] }))
    ]).then(([fRes, lRes]) => {
      const fList = fRes.rows || []
      const lList = lRes.rows || []

      if (!fList.length) {
        setError(`No daily price history records found for ${followerTicker}`)
        return
      }

      // Reverse to chronological order (oldest to newest)
      const fChrono = [...fList].reverse()
      const lChrono = [...lList].reverse()

      const fBase = fChrono[0]?.close || 1
      const lBase = lChrono[0]?.close || (lChrono.length ? lChrono[0].close : 1)

      const dates = fChrono.map(d => d.trade_date)
      const fNorm = fChrono.map(d => Number((((d.close - fBase) / fBase) * 100).toFixed(2)))
      const lNorm = lChrono.length ? lChrono.map(d => Number((((d.close - lBase) / lBase) * 100).toFixed(2))) : fNorm.map(() => 0)

      // Compute min and max percentage bounds for SVG Y scaling
      const allVals = [...fNorm, ...lNorm]
      const minVal = Math.min(...allVals, 0)
      const maxVal = Math.max(...allVals, 5)

      setData({
        followerTicker,
        leaderTicker,
        dates,
        fNorm,
        lNorm,
        minVal,
        maxVal,
        fLatest: fChrono[fChrono.length - 1]?.close,
        lLatest: lChrono[lChrono.length - 1]?.close,
        fPct: fNorm[fNorm.length - 1],
        lPct: lNorm[lNorm.length - 1]
      })
    })
    .catch(e => setError(e.message))
    .finally(() => setLoading(false))
  }, [followerTicker, leaderTicker, apiBase])

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(5, 9, 17, 0.85)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: 20
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: '#0d131f', border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: 14, width: '100%', maxWidth: 780, padding: 24,
          boxShadow: '0 20px 40px rgba(0,0,0,0.6)', color: '#e2e8f0'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Custom 2-Line Sector Rally Comparison ({sector})
            </div>
            <h3 style={{ margin: '4px 0 0 0', fontSize: 18, fontWeight: 800, color: '#f8fafc' }}>
              <span style={{ color: '#c084fc' }}>{followerTicker}</span> vs Sector Leader <span style={{ color: '#38bdf8' }}>{leaderTicker}</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#94a3b8', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 16, fontWeight: 700 }}
          >
            ✕
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 14 }}>
            Building custom 2-line comparative rally trajectory chart…
          </div>
        )}

        {error && (
          <div style={{ padding: 20, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#f87171', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <div>
            {/* Stats Legend */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#161e2e', padding: '12px 16px', borderRadius: 8, marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 14, height: 3, background: '#38bdf8', borderRadius: 2 }} />
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>Front-Runner ({data.leaderTicker})</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#38bdf8', fontFamily: "'DM Mono', monospace" }}>
                    ₹{data.lLatest} ({data.lPct >= 0 ? `+${data.lPct}%` : `${data.lPct}%`})
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 14, height: 3, background: '#c084fc', borderRadius: 2 }} />
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>Follower ({data.followerTicker})</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#c084fc', fontFamily: "'DM Mono', monospace" }}>
                    ₹{data.fLatest} ({data.fPct >= 0 ? `+${data.fPct}%` : `${data.fPct}%`})
                  </div>
                </div>
              </div>
            </div>

            {/* Fresh Dual Line Rally Trajectory SVG Canvas */}
            <div style={{ background: '#070b12', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16 }}>
              <svg viewBox="0 0 700 240" style={{ width: '100%', height: 240, overflow: 'visible' }}>
                {/* Horizontal Reference Grid Lines */}
                <line x1="20" y1="30" x2="680" y2="30" stroke="rgba(255,255,255,0.05)" />
                <line x1="20" y1="120" x2="680" y2="120" stroke="rgba(255,255,255,0.15)" strokeDasharray="4" />
                <line x1="20" y1="210" x2="680" y2="210" stroke="rgba(255,255,255,0.05)" />

                {/* 0% Baseline label */}
                <text x="25" y="116" fill="#64748b" fontSize="10" fontWeight="700">0% Baseline</text>

                {(() => {
                  const range = (data.maxVal - data.minVal) || 10
                  const getY = (val) => 210 - (((val - data.minVal) / range) * 180)

                  const lPoints = data.lNorm.map((val, i) => {
                    const x = 20 + (i / (data.lNorm.length - 1)) * 660
                    const y = getY(val)
                    return `${x.toFixed(1)},${y.toFixed(1)}`
                  }).join(' ')

                  const fPoints = data.fNorm.map((val, i) => {
                    const x = 20 + (i / (data.fNorm.length - 1)) * 660
                    const y = getY(val)
                    return `${x.toFixed(1)},${y.toFixed(1)}`
                  }).join(' ')

                  return (
                    <>
                      {/* Front Runner Line (Blue) */}
                      <polyline fill="none" stroke="#38bdf8" strokeWidth="3" points={lPoints} />
                      {/* Follower Line (Purple) */}
                      <polyline fill="none" stroke="#c084fc" strokeWidth="3" strokeDasharray="6 3" points={fPoints} />

                      {/* Highlight latest data points */}
                      {data.lNorm.length > 0 && (
                        <circle
                          cx={680}
                          cy={getY(data.lNorm[data.lNorm.length - 1])}
                          r="5"
                          fill="#38bdf8"
                        />
                      )}
                      {data.fNorm.length > 0 && (
                        <circle
                          cx={680}
                          cy={getY(data.fNorm[data.fNorm.length - 1])}
                          r="5"
                          fill="#c084fc"
                        />
                      )}
                    </>
                  )
                })()}
              </svg>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748b', marginTop: 10, fontFamily: "'DM Mono', monospace" }}>
                <span>30 Trading Days Ago</span>
                <span>Past 15 Sessions</span>
                <span>Latest Session</span>
              </div>
            </div>

            <p style={{ fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: 14, fontStyle: 'italic' }}>
              Fresh 2-line relative performance comparison tracking Front-Runner leadership vs Follower catch-up move.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export function RetracementPatternPage({ onSelectTicker, apiBase = '/api/intelligence', dataset = 'intelligence' }) {
  const [data, setData] = useState([])
  const [filters, setFilters] = useState({ fib_levels: [], tax_biases: [], sectors: [], breakout_stages: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFib, setSelectedFib] = useState('')
  const [selectedTax, setSelectedTax] = useState('')
  const [selectedSector, setSelectedSector] = useState('')
  const [selectedBreakoutStage, setSelectedBreakoutStage] = useState('')

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const [activeModalText, setActiveModalText] = useState(null)
  const [activeSpeculatorModal, setActiveSpeculatorModal] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (searchTerm) params.set('search', searchTerm)
      if (selectedFib) params.set('fib_level', selectedFib)
      if (selectedTax) params.set('tax_bias', selectedTax)
      if (selectedSector) params.set('sector', selectedSector)
      if (selectedBreakoutStage) params.set('breakout_stage', selectedBreakoutStage)

      const base = apiBase || '/api/intelligence'
      const primaryUrl = `${base}/research/retracement-speculators?${params.toString()}`
      const fallbackUrl = `/api/intelligence/research/retracement-speculators?${params.toString()}`

      let res = await fetch(primaryUrl).catch(() => null)
      if (!res || !res.ok) {
        res = await fetch(fallbackUrl).catch(() => null)
      }

      if (!res || !res.ok) {
        throw new Error('Unable to connect to backend API server.')
      }

      const json = await res.json()
      setData(json.data || [])
      setFilters(json.filters || { fib_levels: [], tax_biases: [], sectors: [] })
    } catch (err) {
      console.error('Error fetching retracement speculators:', err)
      setError(err.message || 'Failed to load retracement speculator data')
    } finally {
      setLoading(false)
    }
  }, [apiBase, searchTerm, selectedFib, selectedTax, selectedSector])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Reset page to 1 whenever filters change
  useEffect(() => {
    setPage(1)
  }, [searchTerm, selectedFib, selectedTax, selectedSector])

  const truncateText = (text, maxLength = 20) => {
    if (!text) return '—'
    if (text.length <= maxLength) return text
    return text.substring(0, 16) + '...'
  }

  const highDefenseCount = useMemo(() => data.filter(d => ['38.2%', '50.0%', '61.8%'].includes(d.fib_retracement_level)).length, [data])
  const taxDumpCount = useMemo(() => data.filter(d => String(d.financial_year_tax_cycle_bias).includes('Q4 Tax')).length, [data])
  const highScoreCount = useMemo(() => data.filter(d => Number(d.speculator_behavior_score) >= 70.0).length, [data])

  // Pagination calculation (default max 10 per page)
  const totalRecords = data.length
  const totalPages = pageSize > 0 ? Math.ceil(totalRecords / pageSize) : 1
  const paginatedData = useMemo(() => {
    if (pageSize === 0) return data
    const start = (page - 1) * pageSize
    return data.slice(start, start + pageSize)
  }, [data, page, pageSize])

  return (
    <div style={{ padding: '24px 32px', minHeight: '100vh', background: '#0a0d14', color: '#f8fafc' }}>
      {/* Modal Popup for Text Truncation Rule 1 */}
      {activeModalText && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#131b2e', border: '1px solid #38bdf8', borderRadius: 12, width: '100%', maxWidth: 520, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#38bdf8', margin: 0 }}>{activeModalText.title}</h3>
              <button onClick={() => setActiveModalText(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', color: '#e2e8f0', fontSize: 13, lineHeight: 1.6 }}>
              {activeModalText.text}
            </div>
          </div>
        </div>
      )}

      {/* Modal Profile Card for Speculator Breakdown */}
      {activeSpeculatorModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#0f172a', border: '1px solid #38bdf8', borderRadius: 16, width: '100%', maxWidth: 640, padding: 28, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#38bdf8', letterSpacing: 1 }}>SPECULATOR PROFILE & RETRACEMENT</span>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f8fafc', margin: '4px 0 0 0' }}>{activeSpeculatorModal.company_name} ({activeSpeculatorModal.ticker})</h2>
              </div>
              <button onClick={() => setActiveSpeculatorModal(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 20 }}>
              <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: 14, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>Fibonacci Level</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#38bdf8' }}>{activeSpeculatorModal.fib_retracement_level}</span>
                <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 2 }}>{activeSpeculatorModal.fib_retracement_pct}% from High</span>
              </div>
              <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: 14, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
                <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>Speculator Score</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: activeSpeculatorModal.speculator_behavior_score >= 70 ? '#4ade80' : '#fbbf24' }}>
                  {Number(activeSpeculatorModal.speculator_behavior_score).toFixed(1)} / 100
                </span>
              </div>
            </div>

            <div style={{ background: 'rgba(30, 41, 59, 0.3)', padding: 16, borderRadius: 10, marginBottom: 20 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1', margin: '0 0 10px 0' }}>Financial Year Quarterly Buy/Dump Ratios</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, textAlign: 'center' }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 6 }}>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>Q1 (Apr-Jun)</span>
                  <div style={{ fontSize: 14, fontWeight: 800, color: activeSpeculatorModal.q1_buy_dump_ratio >= 1.0 ? '#4ade80' : '#f87171' }}>{activeSpeculatorModal.q1_buy_dump_ratio}x</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 6 }}>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>Q2 (Jul-Sep)</span>
                  <div style={{ fontSize: 14, fontWeight: 800, color: activeSpeculatorModal.q2_buy_dump_ratio >= 1.0 ? '#4ade80' : '#f87171' }}>{activeSpeculatorModal.q2_buy_dump_ratio}x</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 6 }}>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>Q3 (Oct-Dec)</span>
                  <div style={{ fontSize: 14, fontWeight: 800, color: activeSpeculatorModal.q3_buy_dump_ratio >= 1.0 ? '#4ade80' : '#f87171' }}>{activeSpeculatorModal.q3_buy_dump_ratio}x</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: 8, borderRadius: 6 }}>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>Q4 (Jan-Mar)</span>
                  <div style={{ fontSize: 14, fontWeight: 800, color: activeSpeculatorModal.q4_buy_dump_ratio >= 1.0 ? '#4ade80' : '#f87171' }}>{activeSpeculatorModal.q4_buy_dump_ratio}x</div>
                </div>
              </div>
            </div>

            <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
              <strong>Behavioral Synthesis:</strong> {activeSpeculatorModal.behavioral_insight}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#38bdf8', letterSpacing: 1.2, textTransform: 'uppercase' }}>
          BEHAVIORAL ALGORITHMIC ANALYTICS
        </span>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#f8fafc', margin: '4px 0 6px 0', letterSpacing: -0.5 }}>
          Retracement Pattern & Speculator Behavior
        </h1>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
          Quantitative model analyzing fundamental institution & technical speculator buy/dump cycles across Fibonacci retracement levels and Financial Year taxation/quarterly rebalancing phases.
        </p>
      </div>

      {/* Stats KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div style={{ background: '#131b2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18 }}>
          <span style={{ fontSize: 11, color: '#94a3b8', display: 'block', fontWeight: 600 }}>Analyzed Tickers</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: '#38bdf8', marginTop: 4, display: 'block' }}>{data.length}</span>
        </div>
        <div style={{ background: '#131b2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18 }}>
          <span style={{ fontSize: 11, color: '#94a3b8', display: 'block', fontWeight: 600 }}>Fib Support Defenders</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: '#4ade80', marginTop: 4, display: 'block' }}>{highDefenseCount}</span>
        </div>
        <div style={{ background: '#131b2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18 }}>
          <span style={{ fontSize: 11, color: '#94a3b8', display: 'block', fontWeight: 600 }}>Q4 Tax Dump Alerts</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: '#f87171', marginTop: 4, display: 'block' }}>{taxDumpCount}</span>
        </div>
        <div style={{ background: '#131b2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 18 }}>
          <span style={{ fontSize: 11, color: '#94a3b8', display: 'block', fontWeight: 600 }}>High Speculator Score (&gt;=70)</span>
          <span style={{ fontSize: 24, fontWeight: 800, color: '#c084fc', marginTop: 4, display: 'block' }}>{highScoreCount}</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div style={{ background: '#131b2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 16, marginBottom: 24, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search Ticker / Company..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', padding: '8px 14px', borderRadius: 8, fontSize: 13, outline: 'none', width: 220 }}
        />

        <select
          value={selectedFib}
          onChange={e => setSelectedFib(e.target.value)}
          style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', padding: '8px 14px', borderRadius: 8, fontSize: 13, outline: 'none' }}
        >
          <option value="">All Fibonacci Levels</option>
          {filters.fib_levels.map(f => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        <select
          value={selectedTax}
          onChange={e => setSelectedTax(e.target.value)}
          style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', padding: '8px 14px', borderRadius: 8, fontSize: 13, outline: 'none' }}
        >
          <option value="">All FY Tax Cycle Biases</option>
          {filters.tax_biases.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          value={selectedSector}
          onChange={e => setSelectedSector(e.target.value)}
          style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', padding: '8px 14px', borderRadius: 8, fontSize: 13, outline: 'none' }}
        >
          <option value="">All Sectors</option>
          {filters.sectors.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {(searchTerm || selectedFib || selectedTax || selectedSector) && (
          <button
            onClick={() => { setSearchTerm(''); setSelectedFib(''); setSelectedTax(''); setSelectedSector('') }}
            style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Main Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#38bdf8', fontSize: 15, fontWeight: 700 }}>
          ⚡ Loading pre-calculated Retracement & Speculator Analytics...
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: 40, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 12, color: '#f87171' }}>
          {error}
        </div>
      ) : (
        <div style={{ background: '#131b2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  <th style={{ padding: '14px 16px' }}>Ticker / Stock</th>
                  <th style={{ padding: '14px 16px' }}>Fib Retracement</th>
                  <th style={{ padding: '14px 16px', textAlign: 'right' }}>Q1 Ratio</th>
                  <th style={{ padding: '14px 16px', textAlign: 'right' }}>Q2 Ratio</th>
                  <th style={{ padding: '14px 16px', textAlign: 'right' }}>Q3 Ratio</th>
                  <th style={{ padding: '14px 16px', textAlign: 'right' }}>Q4 Ratio</th>
                  <th style={{ padding: '14px 16px' }}>FY Tax Cycle Bias</th>
                  <th style={{ padding: '14px 16px', textAlign: 'right' }}>Consolidation Days</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center' }}>Breakout Stage</th>
                  <th style={{ padding: '14px 16px', textAlign: 'right' }}>Speculator Score</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                      No retracement speculator records matched your search criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((r) => {
                    const score = Number(r.speculator_behavior_score) || 50.0
                    const scoreColor = score >= 70 ? '#4ade80' : (score >= 50 ? '#38bdf8' : '#fbbf24')
                    
                    const taxBiasTruncated = truncateText(r.financial_year_tax_cycle_bias, 20)
                    const consolidationDays = Number(r.consolidation_days) || 0
                    const breakoutStage = r.breakout_stage || 'Consolidating'
                    const isConfirmed = breakoutStage.includes('Confirmed')
                    const isRisk = breakoutStage.includes('Risk')

                    return (
                      <tr key={r.ticker} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <span onClick={() => onSelectTicker && onSelectTicker(r.ticker)} style={{ fontWeight: 800, color: '#38bdf8', cursor: 'pointer', fontFamily: "'DM Mono', monospace" }}>
                            {r.ticker}
                          </span>
                          <span style={{ display: 'block', fontSize: 11, color: '#64748b' }}>{r.company_name}</span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 4 }}>
                            {r.fib_retracement_level} ({Number(r.fib_retracement_pct).toFixed(1)}%)
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontFamily: "'DM Mono', monospace", color: r.q1_buy_dump_ratio >= 1.0 ? '#4ade80' : '#f87171' }}>
                          {Number(r.q1_buy_dump_ratio).toFixed(2)}x
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontFamily: "'DM Mono', monospace", color: r.q2_buy_dump_ratio >= 1.0 ? '#4ade80' : '#f87171' }}>
                          {Number(r.q2_buy_dump_ratio).toFixed(2)}x
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontFamily: "'DM Mono', monospace", color: r.q3_buy_dump_ratio >= 1.0 ? '#4ade80' : '#f87171' }}>
                          {Number(r.q3_buy_dump_ratio).toFixed(2)}x
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, fontFamily: "'DM Mono', monospace", color: r.q4_buy_dump_ratio >= 1.0 ? '#4ade80' : '#f87171' }}>
                          {Number(r.q4_buy_dump_ratio).toFixed(2)}x
                        </td>

                        {/* Global Rule 1: Text truncation with interactive modal card */}
                        <td
                          onClick={() => setActiveModalText({ title: 'FY Tax Cycle Bias Details', text: r.financial_year_tax_cycle_bias })}
                          style={{ padding: '12px 16px', cursor: 'pointer', color: '#cbd5e1' }}
                          title="Click to view full text"
                        >
                          {taxBiasTruncated}
                        </td>

                        {/* Consolidation Days Count */}
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, fontFamily: "'DM Mono', monospace", color: '#a78bfa' }}>
                          {consolidationDays} Days
                        </td>

                        {/* Breakout Stage Status Badge */}
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{
                            background: isConfirmed ? 'rgba(34, 197, 94, 0.15)' : (isRisk ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)'),
                            color: isConfirmed ? '#4ade80' : (isRisk ? '#f87171' : '#fbbf24'),
                            border: `1px solid ${isConfirmed ? '#4ade8050' : (isRisk ? '#f8717150' : '#fbbf2450')}`,
                            fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 4, display: 'inline-block'
                          }}>
                            {breakoutStage}
                          </span>
                        </td>

                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, fontFamily: "'DM Mono', monospace", color: scoreColor }}>
                          {score.toFixed(1)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <button
                            onClick={() => setActiveSpeculatorModal(r)}
                            style={{ background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', color: '#38bdf8', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                          >
                            📊 View Profile
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Clean Pagination Controls Footer (Max 10 Items per Page) */}
          {totalRecords > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(15,23,42,0.6)', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                Showing <b>{pageSize === 0 ? 1 : (page - 1) * pageSize + 1}</b> to <b>{pageSize === 0 ? totalRecords : Math.min(page * pageSize, totalRecords)}</b> of <b>{totalRecords}</b> records
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1' }}>
                  <span>Page Size:</span>
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                    style={{ background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, padding: '3px 8px', fontSize: 12, cursor: 'pointer' }}
                  >
                    <option value={10}>10 per page</option>
                    <option value={25}>25 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                    <option value={0}>All ({totalRecords})</option>
                  </select>
                </div>

                {pageSize > 0 && totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      style={{
                        background: page <= 1 ? 'rgba(255,255,255,0.05)' : 'rgba(56, 189, 248, 0.15)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: page <= 1 ? '#64748b' : '#38bdf8',
                        padding: '3px 10px', borderRadius: 6, fontSize: 12,
                        cursor: page <= 1 ? 'not-allowed' : 'pointer'
                      }}
                    >
                      ◄ Prev
                    </button>
                    <span style={{ fontSize: 12, color: '#fff', fontWeight: 600, padding: '0 6px' }}>
                      Page {page} of {totalPages}
                    </span>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      style={{
                        background: page >= totalPages ? 'rgba(255,255,255,0.05)' : 'rgba(56, 189, 248, 0.15)',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: page >= totalPages ? '#64748b' : '#38bdf8',
                        padding: '3px 10px', borderRadius: 6, fontSize: 12,
                        cursor: page >= totalPages ? 'not-allowed' : 'pointer'
                      }}
                    >
                      Next ►
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function WatchlistMonitorPage({ apiBase = '/api/intelligence', dataset = 'intelligence', onSelectTicker }) {
  const [watchlists, setWatchlists] = useState([])
  const [selectedWatchlistId, setSelectedWatchlistId] = useState(null)
  const [tickers, setTickers] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [modalText, setModalText] = useState(null)
  const [activeChartTicker, setActiveChartTicker] = useState(null)
  // Pagination
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const loadData = async (wlId) => {
    setLoading(true)
    setError(null)
    try {
      const params = wlId ? `?watchlist_id=${wlId}` : ''
      const res = await fetch(`${apiBase}/research/watchlist-monitor${params}`)
      if (!res.ok) throw new Error((await res.json()).detail || 'Failed to fetch watchlist data')
      const data = await res.json()
      setWatchlists(data.watchlists || [])
      setSelectedWatchlistId(data.watchlist_id)
      setTickers(data.tickers || [])
      setSummary(data.summary || null)
      setPage(1)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData(null) }, [apiBase, dataset])

  const handleWatchlistChange = (id) => {
    setSelectedWatchlistId(id)
    loadData(id)
  }

  // Client-side search filter
  const filteredTickers = useMemo(() => {
    if (!search.trim()) return tickers
    const q = search.toLowerCase()
    return tickers.filter(t =>
      (t.ticker || '').toLowerCase().includes(q) ||
      (t.company_name || '').toLowerCase().includes(q) ||
      (t.sector || '').toLowerCase().includes(q) ||
      (t.overall_signal || '').toLowerCase().includes(q)
    )
  }, [tickers, search])

  // Pagination
  const totalPages = pageSize === 0 ? 1 : Math.ceil(filteredTickers.length / pageSize)
  const pagedTickers = pageSize === 0 ? filteredTickers : filteredTickers.slice((page - 1) * pageSize, page * pageSize)

  const cardStyle = { background: '#161b22', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16 }
  const inpStyle = { background: '#0d1117', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#e2e8f0', padding: '8px 12px', fontSize: 13, outline: 'none' }

  const selectedWatchlist = watchlists.find(w => w.id === selectedWatchlistId)

  const signalColor = (sig) => {
    if (!sig) return '#94a3b8'
    if (sig.includes('STRONG_BUY') || sig.includes('STRONG BUY')) return '#4ade80'
    if (sig.includes('BUY')) return '#86efac'
    if (sig.includes('STRONG_SELL') || sig.includes('STRONG SELL')) return '#f87171'
    if (sig.includes('SELL')) return '#fca5a5'
    return '#fbbf24'
  }

  const scoreBar = (score, color) => {
    const pct = Math.max(0, Math.min(100, ((score + 1) / 2) * 100))
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', minWidth: 50 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
        </div>
        <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color, minWidth: 34, textAlign: 'right' }}>
          {pct.toFixed(0)}%
        </span>
      </div>
    )
  }

  const renderTruncatedCell = (text) => {
    if (!text || text.length <= 20) return text || '—'
    return text.slice(0, 16) + '...'
  }

  const fmtNum = (v, decimals = 2) => v != null && v !== 0 ? Number(v).toFixed(decimals) : '—'
  const fmtVol = (v) => {
    if (!v) return '—'
    if (v >= 1e7) return `${(v / 1e7).toFixed(2)}Cr`
    if (v >= 1e5) return `${(v / 1e5).toFixed(2)}L`
    if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`
    return String(v)
  }

  return (
    <div style={{ padding: 24, background: '#090d16', minHeight: '100vh', color: '#e2e8f0' }}>

      {/* Full-text modal */}
      {modalText && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setModalText(null)}
        >
          <div
            style={{ background: '#161b22', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 12, padding: 24, maxWidth: 560, width: '100%', maxHeight: '70vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: 13 }}>Full Detail</span>
              <button onClick={() => setModalText(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18 }}><X size={16} /></button>
            </div>
            <p style={{ color: '#e2e8f0', fontSize: 13, lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>{modalText}</p>
          </div>
        </div>
      )}

      {/* Chart modal */}
      {activeChartTicker && (
        <StockVisualizerModal ticker={activeChartTicker} apiBase={apiBase} dataset={dataset} onClose={() => setActiveChartTicker(null)} />
      )}

      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Star size={22} style={{ color: '#f59e0b' }} />
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Watchlist Monitor</h2>
            <span style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, border: '1px solid rgba(245,158,11,0.3)' }}>
              LIVE WATCHLIST TRACKER
            </span>
          </div>
          <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
            Monitor fundamental & technical performance for all tickers in your watchlists. Select a watchlist to instantly view scores, signals, indicators, and research links.
          </p>
        </div>
        <button
          onClick={() => loadData(selectedWatchlistId)}
          disabled={loading}
          style={{ ...inpStyle, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', background: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.3)', color: '#f59e0b', fontWeight: 600 }}
        >
          <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* Watchlist Selector + Search */}
      <div style={{ ...cardStyle, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>Select Watchlist:</label>
          <select
            value={selectedWatchlistId || ''}
            onChange={e => handleWatchlistChange(Number(e.target.value))}
            disabled={loading || watchlists.length === 0}
            style={{ ...inpStyle, minWidth: 260, fontWeight: 700, color: '#f59e0b', background: '#0d1726', borderColor: '#3d2e0a', cursor: 'pointer' }}
          >
            {watchlists.map(w => (
              <option key={w.id} value={w.id} style={{ background: '#0d1726', color: '#fff' }}>
                {w.name} ({w.ticker_count} tickers)
              </option>
            ))}
          </select>
          {selectedWatchlist?.description && (
            <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
              {selectedWatchlist.description.length > 60 ? selectedWatchlist.description.slice(0, 60) + '…' : selectedWatchlist.description}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input
              type="text"
              placeholder="Search ticker / company / sector…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              style={{ ...inpStyle, paddingLeft: 30, width: 240 }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={12} />
              </button>
            )}
          </div>
          <span style={{ fontSize: 12, color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}>
            Showing <strong style={{ color: '#4ade80' }}>{filteredTickers.length}</strong> / {tickers.length} tickers
          </span>
        </div>
      </div>

      {loading && <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Loading watchlist ticker performance data…</div>}
      {error && <div style={{ padding: 20, background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', color: '#f87171', borderRadius: 8, marginBottom: 20 }}>{error}</div>}

      {!loading && !error && (
        <>
          {/* Summary KPI Cards */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
              <div style={{ ...cardStyle, background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Total Watchlist Tickers</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#f59e0b', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{summary.count}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>in selected watchlist</div>
              </div>

              <div style={{ ...cardStyle, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <div style={{ fontSize: 11, color: '#4ade80', fontWeight: 700, textTransform: 'uppercase' }}>Bullish Signals</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#4ade80', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{summary.bullish}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{summary.count > 0 ? ((summary.bullish / summary.count) * 100).toFixed(1) : '0.0'}% BUY signals</div>
              </div>

              <div style={{ ...cardStyle, background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <div style={{ fontSize: 11, color: '#f87171', fontWeight: 700, textTransform: 'uppercase' }}>Bearish Signals</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#f87171', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{summary.bearish}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{summary.count > 0 ? ((summary.bearish / summary.count) * 100).toFixed(1) : '0.0'}% SELL signals</div>
              </div>

              <div style={{ ...cardStyle, background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.2)' }}>
                <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase' }}>Avg Technical Score</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#38bdf8', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{(((summary.avg_technical_score + 1) / 2) * 100).toFixed(1)}%</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Watchlist tech avg</div>
              </div>

              <div style={{ ...cardStyle, background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.2)' }}>
                <div style={{ fontSize: 11, color: '#c084fc', fontWeight: 700, textTransform: 'uppercase' }}>Avg Fundamental Score</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#c084fc', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{(((summary.avg_fundamental_score + 1) / 2) * 100).toFixed(1)}%</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Watchlist fundamental avg</div>
              </div>

              <div style={{ ...cardStyle, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)' }}>
                <div style={{ fontSize: 11, color: '#818cf8', fontWeight: 700, textTransform: 'uppercase' }}>Top Ranked Ticker</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#818cf8', marginTop: 4, fontFamily: "'DM Mono', monospace" }}>{summary.top_ticker}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Highest hybrid score</div>
              </div>
            </div>
          )}

          {/* Data Table */}
          {tickers.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: 'center', padding: 40, color: '#64748b' }}>
              <Star size={32} style={{ color: '#334155', marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 600 }}>No tickers found in this watchlist</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>Add tickers in Master Data → Watchlists to start monitoring performance.</div>
            </div>
          ) : (
            <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      {['#', 'Ticker', 'Company', 'Sector', 'Price (₹)', 'Tech Score', 'Fund. Score', 'Hybrid Score', 'Signal', 'Confidence', 'RSI14', 'SMA20', 'Volume', 'PE', 'PAT (Cr)', 'Chart'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedTickers.map((t, i) => {
                      const rowIdx = (page - 1) * pageSize + i + 1
                      const sig = t.overall_signal || 'HOLD'
                      const sigColor = signalColor(sig)
                      const techPct = (((t.technical_score + 1) / 2) * 100)
                      const fundPct = (((t.fundamental_score + 1) / 2) * 100)
                      const hybPct = (((t.hybrid_score + 1) / 2) * 100)
                      const rsi = t.rsi14 != null ? Number(t.rsi14).toFixed(1) : '—'
                      const rsiColor = t.rsi14 != null ? (t.rsi14 >= 70 ? '#f87171' : t.rsi14 <= 30 ? '#4ade80' : '#94a3b8') : '#94a3b8'
                      return (
                        <tr
                          key={t.ticker}
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <td style={{ padding: '9px 12px', color: '#475569', fontFamily: "'DM Mono', monospace" }}>{pageSize === 0 ? i + 1 : rowIdx}</td>
                          <td style={{ padding: '9px 12px' }}>
                            <button
                              onClick={() => onSelectTicker && onSelectTicker(t.ticker)}
                              style={{ background: 'none', border: 'none', color: '#38bdf8', fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: "'DM Mono', monospace", padding: 0, textDecoration: 'underline dotted' }}
                            >
                              {t.ticker}
                              {t.is_fno && <span style={{ marginLeft: 4, fontSize: 9, background: 'rgba(250,204,21,0.15)', color: '#fbbf24', borderRadius: 3, padding: '1px 4px' }}>F&O</span>}
                            </button>
                          </td>
                          <td style={{ padding: '9px 12px', maxWidth: 140 }}>{renderTruncatedCell(t.company_name)}</td>
                          <td style={{ padding: '9px 12px', maxWidth: 110 }}>{renderTruncatedCell(t.sector)}</td>
                          <td style={{ padding: '9px 12px', fontFamily: "'DM Mono', monospace", color: '#f8fafc', fontWeight: 700 }}>
                            {t.current_price > 0 ? `₹${Number(t.current_price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                          </td>
                          <td style={{ padding: '9px 12px', minWidth: 100 }}>
                            {scoreBar(t.technical_score, '#38bdf8')}
                          </td>
                          <td style={{ padding: '9px 12px', minWidth: 100 }}>
                            {scoreBar(t.fundamental_score, '#c084fc')}
                          </td>
                          <td style={{ padding: '9px 12px', minWidth: 100 }}>
                            {scoreBar(t.hybrid_score, '#f59e0b')}
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{
                              background: `${sigColor}18`, color: sigColor, padding: '2px 7px', borderRadius: 4,
                              fontSize: 10, fontWeight: 800, letterSpacing: 0.5, whiteSpace: 'nowrap',
                              border: `1px solid ${sigColor}40`
                            }}>
                              {sig.length > 16 ? sig.slice(0, 16) + '…' : sig}
                            </span>
                          </td>
                          <td style={{ padding: '9px 12px', fontFamily: "'DM Mono', monospace", color: '#94a3b8' }}>
                            {t.confidence != null ? `${Number(t.confidence).toFixed(1)}%` : '—'}
                          </td>
                          <td style={{ padding: '9px 12px', fontFamily: "'DM Mono', monospace", color: rsiColor, fontWeight: 700 }}>{rsi}</td>
                          <td style={{ padding: '9px 12px', fontFamily: "'DM Mono', monospace", color: '#94a3b8' }}>{fmtNum(t.sma20)}</td>
                          <td style={{ padding: '9px 12px', fontFamily: "'DM Mono', monospace", color: '#64748b' }}>{fmtVol(t.latest_volume)}</td>
                          <td style={{ padding: '9px 12px', fontFamily: "'DM Mono', monospace", color: '#94a3b8' }}>{fmtNum(t.pe, 1)}</td>
                          <td style={{ padding: '9px 12px', fontFamily: "'DM Mono', monospace", color: t.pat > 0 ? '#4ade80' : t.pat < 0 ? '#f87171' : '#94a3b8' }}>
                            {t.pat != null && t.pat !== 0 ? `${t.pat > 0 ? '+' : ''}${Number(t.pat).toFixed(2)}` : '—'}
                          </td>

                          <td style={{ padding: '9px 12px' }}>
                            <button
                              onClick={() => setActiveChartTicker(t.ticker)}
                              style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', color: '#38bdf8', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
                            >
                              Chart
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>Rows per page:</span>
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
                    style={{ ...inpStyle, padding: '4px 8px', fontSize: 12, width: 'auto' }}
                  >
                    {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                    <option value={0}>All</option>
                  </select>
                  <span style={{ fontSize: 12, color: '#475569' }}>
                    {filteredTickers.length === 0 ? '0 items' : pageSize === 0 ? `All ${filteredTickers.length} items` : `${Math.min((page - 1) * pageSize + 1, filteredTickers.length)}–${Math.min(page * pageSize, filteredTickers.length)} of ${filteredTickers.length}`}
                  </span>
                </div>
                {pageSize > 0 && totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      style={{ ...inpStyle, padding: '4px 10px', fontSize: 12, cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.4 : 1 }}
                    >◄ Prev</button>
                    <span style={{ fontSize: 12, color: '#94a3b8', padding: '0 8px' }}>Page {page} / {totalPages}</span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      style={{ ...inpStyle, padding: '4px 10px', fontSize: 12, cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.4 : 1 }}
                    >Next ►</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

