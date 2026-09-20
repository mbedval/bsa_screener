import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Activity, ArrowRight, Ban, BarChart3, BookMarked, Calendar, ChevronDown, ChevronRight,
  Database, Edit2, ExternalLink, FileText, Filter, GitCompare, Globe, Home, LayoutDashboard, Layers, PieChart, Plus,
  RefreshCw, Search, Settings2, Share2, Shield, TableProperties, Tag,
  Download, Trash2, TrendingUp, User, Users, X, Star, Target, Zap
} from 'lucide-react'
import MasterSubmodule, { SectorsPage, TickersPage, WatchlistsPage, UsersPage, AlternativeNamesPage, ExcludedTickersPage, RecommendationsPage, OpportunitiesRiskPage, ReferencePagesPage, ScreenerTickerMappingPage } from './master/index.jsx'
import { StockChartVisualizer, StockVisualizerModal, SectorHeatmapVisualizer, ChartsVisualizationsPage, ChartErrorBoundary, ResearchBoardPage, PatternViewerPage, IndicesPatternViewerPage, TickerResearchProfilePage, SearchDetailPage, SectorWiseReportPage, MarketCapWiseReportPage, StocksRespectingPatternsPage, SectorwiseFollowersPage, RetracementPatternPage, WatchlistMonitorPage } from './visualizer/index.jsx'



import './styles.css'

// ─── Constants ───────────────────────────────────────────────────────────────
const groupIcon = {
  Calls: Activity, Scanners: TrendingUp, 'Technical Scanners': TrendingUp,
  'Fundamental Analysis': BarChart3, 'Shared cache': Database, 'Raw data': Database,
  Sectors: BarChart3, 'Sectorial Views': BarChart3, 'Delivery spikes': Activity,
  Reference: BookMarked, Analysis: BarChart3, 'Data tables': TableProperties,
  Derivative: Layers, DERIVATIVE: Layers,
}

const subApps = {
  'ticker-search': {
    id: 'ticker-search',
    title: 'Quick Ticker Report',
    eyebrow: 'SEARCH & REPORTS',
    icon: Search,
    description: 'Lookup ticker master data, PDF-aligned technical analysis reports, volume spikes & financial metrics.',
    defaultView: 'research:search_detail'
  },
  'calls': {
    id: 'calls',
    title: 'Trading Calls & Strategy',
    eyebrow: 'MOMENTUM TRADES',
    icon: Activity,
    description: 'Algorithmic momentum trade setups across Mid-Cap, Small-Cap, Large-Cap universes & Broker recommendations.',
    defaultView: 'dashboard'
  },
  'scanners': {
    id: 'scanners',
    title: 'Technical Scanners & Patterns',
    eyebrow: 'QUANTITATIVE SCANNERS',
    icon: TrendingUp,
    description: 'Multi-strategy quantitative scanners, breakout setups, reversal pinbars & candlestick pattern viewer.',
    defaultView: 'research:patterns'
  },
  'derivatives': {
    id: 'derivatives',
    title: 'Derivatives & F&O Hub',
    eyebrow: 'OPTIONS ANALYTICS',
    icon: Layers,
    description: 'Interactive option chain analyzer, best option strategy evaluator & active F&O contract buildup.',
    defaultView: 'option_chain_analyzer'
  },
  'master-data': {
    id: 'master-data',
    title: 'Master Data Admin',
    eyebrow: 'SYSTEM CONFIG & REFERENCE',
    icon: Settings2,
    description: 'Manage master tickers, sector mappings, F&O lists, watchlists, users, aliases & exclusion rules.',
    defaultView: 'master:tickers'
  },
  'raw-data': {
    id: 'raw-data',
    title: 'Raw Data Explorer',
    eyebrow: 'POSTGRESQL TABLES',
    icon: Database,
    description: 'Inspect underlying PostgreSQL database tables, raw OHLCV price history, delivery stats & fundamentals.',
    defaultView: 'ohlcv_daily'
  }
}

const apps = {
  rawdata: {
    title: 'Raw Data Explorer', eyebrow: 'RAW DATA EXPLORER',
    description: 'Inspect source market data, technical indicators, fundamentals and master reference tables.',
    database: 'bsa_db', accent: 'Source tables',
  },
  intelligence: {
    title: 'BSA Market Intelligence Suite', eyebrow: 'BSA MARKET INTELLIGENCE',
    description: 'Explore generated calls, scanner outputs, sector analysis, F&O options and ticker reports.',
    database: 'bsa_db', accent: 'Analysis sources',
  },
}


const cleanTicker = val => {
  if (!val) return ''
  const str = typeof val === 'object' ? (val.ticker || val.symbol || '') : String(val)
  return str.replace(/\.(NS|BO)$/i, '')
}

const maskHost = (hostStr) => {
  if (!hostStr) return 'jmbx'
  const str = String(hostStr).trim()
  if (str === '127.0.0.1' || str === 'localhost' || str === '::1') {
    return 'jmbx (local)'
  }
  const parts = str.split('.')
  if (parts.length === 4 && !isNaN(parts[3])) {
    const octet = parseInt(parts[3], 10)
    return `jmbx${octet}`
  }
  return str
}

const format = (value, key = '') => {
  if (value === null || value === undefined) return '—'
  if (key === 'ticker' || key === 'symbol') return cleanTicker(value)
  if (Array.isArray(value)) return value.map(cleanTicker).join(', ') || '—'
  if (typeof value === 'boolean') return value ? '✓ Yes' : '✗ No'
  if (typeof value === 'number') {
    if (key.includes('market_cap')) return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)} Cr`
    return key.includes('ratio') || key.includes('confidence') || key.includes('change') || key.includes('deviation')
      ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
      : value.toLocaleString('en-IN')
  }
  return String(value)
}

const getSignalClass = (val) => {
  if (!val) return 'neutral'
  const v = String(val).toUpperCase()
  if (v.includes('BUY') || v === 'BULLISH' || v === 'POSITIVE' || v === 'ACCUMULATION') return 'buy'
  if (v.includes('SELL') || v === 'BEARISH' || v === 'NEGATIVE' || v === 'DISTRIBUTION') return 'sell'
  return 'neutral'
}

const signalTone = value => {
  if (typeof value !== 'string') return 'neutral'
  const v = value.trim().toUpperCase()
  if (v.includes('STRONG BUY') || v.includes('STRONG_BULLISH') || v === 'BETTER') return 'strong-buy'
  if (v.includes('STRONG SELL') || v.includes('STRONG_BEARISH') || v === 'BAD') return 'strong-sell'
  if (v.includes('BUY') || v === 'BULLISH' || v === 'POSITIVE' || v === 'ACCUMULATION' || v === 'GOOD') return 'buy'
  if (v.includes('SELL') || v === 'BEARISH' || v === 'NEGATIVE' || v === 'DISTRIBUTION') return 'sell'
  return 'neutral'
}

// Master page identifiers
const MASTER_PAGES = ['master:sectors', 'master:tickers', 'master:watchlists', 'master:users', 'master:aliases', 'master:excluded', 'master:recommendations', 'master:opportunities', 'master:references', 'master:reference_pages', 'master:screener_mappings']

const parseResp = async (r) => {
  const ct = r.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    const text = await r.text()
    throw new Error(r.ok ? 'Invalid response format received from server.' : `HTTP ${r.status}: ${text.slice(0, 100)}`)
  }
  return r.json()
}
const api = {
  get: async (url) => { const r = await fetch(url); if (!r.ok) { const e = await parseResp(r); throw new Error(e.detail || r.statusText) } return parseResp(r) },
  post: async (url, body) => { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) { const e = await parseResp(r); throw new Error(e.detail || r.statusText) } return parseResp(r) },
  put: async (url, body) => { const r = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) { const e = await parseResp(r); throw new Error(e.detail || r.statusText) } return parseResp(r) },
  del: async (url) => { const r = await fetch(url, { method: 'DELETE' }); if (!r.ok && r.status !== 204) { const e = await parseResp(r); throw new Error(e.detail || r.statusText) } return true },
}


// ─── Shared UI components ─────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function Toast({ message, type = 'success', onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t) }, [])
  return <div className={`toast toast-${type}`}>{message}</div>
}

function useToast() {
  const [toast, setToast] = useState(null)
  const show = (message, type = 'success') => setToast({ message, type, key: Date.now() })
  const hide = () => setToast(null)
  const ToastEl = toast ? <Toast key={toast.key} message={toast.message} type={toast.type} onClose={hide} /> : null
  return { show, ToastEl }
}

// ─── Theme Selector Component ─────────────────────────────────────────
function ThemeSelector({ currentTheme, onSelectTheme }) {
  const themes = [
    { id: 'blue', label: 'Classic Blue', color: '#4e8bff', bg: '#09111f' },
    { id: 'green', label: 'Forest Green', color: '#3eb47a', bg: '#081710' },
    { id: 'warm', label: 'Warm Earth', color: '#d48e46', bg: '#18130e' },
    { id: 'hacker', label: 'Hacker Terminal', color: '#00ff66', bg: '#020c05' },
  ]

  return (
    <div className="theme-selector">
      <span className="theme-selector-label">Theme:</span>
      <div className="theme-selector-options">
        {themes.map(t => (
          <button
            key={t.id}
            onClick={() => onSelectTheme(t.id)}
            className={`theme-btn ${currentTheme === t.id ? 'active' : ''}`}
            style={{
              '--btn-color': t.color,
              '--btn-bg': t.bg,
            }}
          >
            <span className="theme-dot" style={{ background: t.color }} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Landing page ─────────────────────────────────────────────────────────────
function Landing({ theme, setTheme, onSelectApp, onSelectSubApp }) {
  return (
    <div className="landing">
      <main className="landing-main" style={{ maxWidth: 1380, margin: '0 auto', padding: '16px 20px 20px 20px' }}>
        <div className="landing-logo-wrap" style={{ marginBottom: 8 }}>
          <img src="/bsa.png" alt="BSA Logo" className="landing-logo" style={{ height: 48, width: 'auto' }} />
        </div>
        <p className="eyebrow portal-title-highlight" style={{ fontSize: 13, letterSpacing: 1.5, marginBottom: 4 }}>BSA MARKET INTELLIGENCE PORTAL</p>
        <h1 style={{ marginBottom: 6, fontSize: 20 }}>Modular Market Intelligence Suite</h1>
        <p style={{ color: '#94a3b8', fontSize: 13, maxWidth: 680, margin: '0 auto 20px auto', textAlign: 'center', lineHeight: 1.4 }}>
          Decomposed modular sub-applications for targeted trading setup discovery, option analytics, technical scanners, and master data management.
        </p>

        {/* High-Density Compact Sub-App Grid Launcher */}
        <div className="landing-card-grid">
          {Object.entries(subApps).map(([key, item]) => {
            const Icon = item.icon
            return (
              <div
                key={key}
                className="app-card-compact"
                onClick={() => {
                  if (onSelectSubApp) onSelectSubApp(key)
                }}
              >
                <div>
                  <div className="app-card-header">
                    <div className="app-card-icon-box">
                      <Icon size={16} />
                    </div>
                    <span className="app-card-eyebrow">{item.eyebrow}</span>
                  </div>
                  <h2 className="app-card-title">{item.title}</h2>
                  <p className="app-card-desc">{item.description}</p>
                </div>
                <div className="app-card-action">
                  Launch Sub-App <ArrowRight size={13} />
                </div>
              </div>
            )
          })}
        </div>
      </main>
      <footer className="landing-footer" style={{ padding: '12px 24px 10px' }}>
        <div className="footer-top">
          <div className="brand" style={{ gap: 10 }}>
            <img src="/BSA.png" alt="BSA Logo" style={{ height: 28, width: 'auto', borderRadius: 4 }} />
            <div><b>BSA Data Portal</b><small>POSTGRESQL APPLICATIONS</small></div>
          </div>
          <ThemeSelector currentTheme={theme} onSelectTheme={setTheme} />
        </div>

        <div className="footer-middle" style={{ paddingTop: 8 }}>
          <div className="footer-info">
            <p className="footer-copy">© {new Date().getFullYear()} BSA Market Intelligence. All rights reserved.</p>
            <p className="footer-subtext">Institutional-grade stock market analytics, automated trading calls, and multi-factor technical scanners.</p>
          </div>

          <div className="footer-socials">
            <a href="https://telegram.org" target="_blank" rel="noreferrer" title="Telegram" className="social-link" style={{ width: 28, height: 28 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
            </a>
            <a href="https://twitter.com" target="_blank" rel="noreferrer" title="Twitter / X" className="social-link" style={{ width: 28, height: 28 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/></svg>
            </a>
            <a href="https://linkedin.com" target="_blank" rel="noreferrer" title="LinkedIn" className="social-link" style={{ width: 28, height: 28 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>
            </a>
            <a href="https://github.com" target="_blank" rel="noreferrer" title="GitHub" className="social-link" style={{ width: 28, height: 28 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}



// ─── Main App Component ───────────────────────────────────────────────────────
function App() {
  const [path, setPath] = useState(() => window.location.pathname.replace(/^\/|\/$/g, ''))
  const [theme, setTheme] = useState(() => localStorage.getItem('bsa_theme') || 'blue')
  const [catalog, setCatalog] = useState([])
  const [overview, setOverview] = useState(null)
  const [dbInfo, setDbInfo] = useState(null)
  const [active, setActive] = useState('dashboard')
  const [data, setData] = useState(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sectorSummary, setSectorSummary] = useState([])
  const [activeSector, setActiveSector] = useState(null)
  const [sectorScanTable, setSectorScanTable] = useState('operatorfootprint')
  const [sectorData, setSectorData] = useState(null)
  const [selectedFnoTicker, setSelectedFnoTicker] = useState('NIFTY')
  const [selectedProfileTicker, setSelectedProfileTicker] = useState('')
  const [expandedSection, setExpandedSection] = useState('Research Board')
  const [searchCounter, setSearchCounter] = useState(0)

  const triggerSearchDetail = () => {
    setActive('research:search_detail')
    setSearchCounter(c => c + 1)
  }

  const [searchHistory, setSearchHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('bsa_search_history') || '[]') } catch (_) { return [] }
  })

  const addSearchHistory = useCallback((term) => {
    if (!term || typeof term !== 'string') return
    const clean = term.trim().toUpperCase()
    if (!clean || clean.length < 2) return
    setSearchHistory(prev => {
      const filtered = prev.filter(item => item !== clean)
      const updated = [clean, ...filtered].slice(0, 10)
      try { localStorage.setItem('bsa_search_history', JSON.stringify(updated)) } catch (_) {}
      return updated
    })
  }, [])

  const dataset = path.startsWith('us_intelligence') ? 'us_intelligence' : (path.startsWith('intelligence') ? 'intelligence' : 'rawdata')
  const appInfo = apps[dataset] || apps['intelligence']
  const apiBase = `/api/${dataset}`

  useEffect(() => {
    document.body.setAttribute('data-theme', theme)
    localStorage.setItem('bsa_theme', theme)
  }, [theme])

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname.replace(/^\/|\/$/g, ''))
    const handleNavTable = (e) => {
      if (e.detail) {
        if (typeof e.detail === 'object' && e.detail.active) {
          if (e.detail.ticker) setSelectedProfileTicker(cleanTicker(e.detail.ticker).toUpperCase())
          setActive(e.detail.active)
        } else if (typeof e.detail === 'string') {
          setActive(e.detail)
        }
      }
    }
    window.addEventListener('popstate', handlePopState)
    window.addEventListener('navigate_table', handleNavTable)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('navigate_table', handleNavTable)
    }
  }, [])

  const navigateTo = (newPath) => {
    const cleanP = (newPath || '').replace(/^\/|\/$/g, '')
    window.history.pushState({}, '', cleanP === '' ? '/' : `/${cleanP}`)
    setPath(cleanP)
  }

  const handleFnoTickerSelect = (symbol) => {
    if (!symbol) return
    const s = cleanTicker(symbol).toUpperCase()
    setSelectedFnoTicker(s)
    setActive('option_chain_analyzer')
  }

  const handleProfileTickerSelect = (symbol) => {
    if (!symbol) return
    const s = cleanTicker(symbol).toUpperCase()
    setSelectedProfileTicker(s)
    setActive('research:ticker_profile')
  }

  // Navigate ticker clicks to the Lookup Ticker Master Data page
  const handleLookupTickerSelect = (symbol) => {
    if (!symbol) return
    const s = cleanTicker(symbol).toUpperCase()
    setSelectedProfileTicker(s)
    setSearchCounter(c => c + 1)
    setActive('research:search_detail')
  }


  const load = async (tableName = active, search = query) => {
    setLoading(true)
    setError('')
    try {
      const q = search ? `&search=${encodeURIComponent(search)}` : ''
      const res = await api.get(`${apiBase}/tables/${tableName}?limit=500${q}`)
      setData(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const refreshDashboard = () => {
    if (path === '' || path === '/') return
    setError('')
    fetch(`${apiBase}/catalog`)
      .then(r => r.ok ? r.json() : [])
      .then(cat => setCatalog(Array.isArray(cat) ? cat : []))
      .catch(() => {})

    fetch(`${apiBase}/overview`)
      .then(r => r.ok ? r.json() : null)
      .then(o => { if (o) setOverview(o) })
      .catch(() => {})

    fetch(`${apiBase}/database-info`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setDbInfo(d) })
      .catch(e => setError(e.message))

    if (dataset === 'intelligence') {
      api.get('/api/master/sectors-summary')
        .then(s => setSectorSummary(Array.isArray(s) ? s : []))
        .catch(() => {})
    }
  }

  const loadSectorData = async (sectorName, scanTable) => {
    try {
      const res = await api.get(`/api/intelligence/sector/${encodeURIComponent(sectorName)}/scans?scan_table=${scanTable}`)
      setSectorData(res)
    } catch (e) { setError(e.message) }
  }

  useEffect(() => {
    if (window.location.hash === '#live_pattern_hub') {
      setActive('research:live_pattern_hub')
      setPath('intelligence')
    }
  }, [])

  useEffect(() => {
    if (path !== '' && path !== '/') {
      refreshDashboard()
    }
  }, [dataset, path])

  useEffect(() => {
    if (path === '' || path === '/') return
    const customPages = ['dashboard', 'midcap_dashboard', 'smallcap_dashboard', 'largecap_dashboard', 'fno_active', 'option_chain_analyzer', 'best_option_strategy', 'charts_visualizations']
    if (!customPages.includes(active) && !MASTER_PAGES.includes(active) && !active.startsWith('sector:') && !active.startsWith('research:')) {
      load(active, '')
    }
    if (active.startsWith('sector:')) {
      const sName = active.replace('sector:', '')
      setActiveSector(sName)
      loadSectorData(sName, sectorScanTable)
    }
  }, [active, path])


  const grouped = useMemo(() =>
    catalog.reduce((acc, item) => ({ ...acc, [item.group]: [...(acc[item.group] || []), item] }), {}),
    [catalog]
  )
  const current = catalog.find(item => item.name === active)

  useEffect(() => {
    if (path === '' || path === '/') return
    const isMaster = active.startsWith('master:') || active === 'fno_stock_master' || active === 'fno_index_master' || active === 'fno_master' || active === 'ticker_master'
    const isSector = active.startsWith('sector:')
    const isReport = ['research:market_cap_wise', 'research:sector_wise', 'research:penny_stocks', 'research:stocks_respecting_patterns', 'research:sectorwise_followers', 'research:watchlist_monitor'].includes(active)
    if (isMaster) {
      setExpandedSection('Master Data')
    } else if (isSector) {
      setExpandedSection('By Sector')
    } else if (isReport) {
      setExpandedSection('Reports')
    } else if (current?.group) {
      setExpandedSection(current.group)
    } else {
      setExpandedSection('Research Tools')
    }
  }, [active, path, current])

  const toggleSection = (groupName) => {
    setExpandedSection(prev => prev === groupName ? null : groupName)
  }

  const handleSectorScanChange = (t) => { setSectorScanTable(t); if (activeSector) loadSectorData(activeSector, t) }
  const handleMasterNav = (sub) => setActive(`master:${sub}`)

  const [activeSubApp, setActiveSubApp] = useState('ticker-search')

  const handleSelectSubApp = (subAppKey) => {
    const sApp = subApps[subAppKey]
    if (sApp) {
      setActiveSubApp(subAppKey)
      if (sApp.defaultView === 'research:search_detail') {
        triggerSearchDetail()
      } else {
        setActive(sApp.defaultView)
      }
      navigateTo('intelligence')
    }
  }

  if (path === '' || path === '/') {
    return <Landing theme={theme} setTheme={setTheme} onSelectApp={(appKey) => navigateTo(appKey)} onSelectSubApp={handleSelectSubApp} />
  }

  return (
    <div className="app-shell">
      <aside>
        <div className="brand" style={{ gap: 10 }}>
          <img src="/bsa.png" alt="BSA Logo" style={{ height: 32, width: 'auto', borderRadius: 6 }} />
          <div><b>{appInfo.title}</b></div>
        </div>
        <nav>
          <a
            className="nav-item home-link"
            href="/"
            onClick={e => {
              e.preventDefault()
              setPath('')
            }}
          >
            <Home /> Home
          </a>
          <button className={`nav-item ${active === 'research:search_detail' ? 'selected' : ''}`} onClick={() => triggerSearchDetail()}>
            <Search size={14} /> Quick Ticker Report
          </button>
          <section className={`nav-section ${expandedSection === 'Research Tools' ? 'expanded' : 'collapsed'}`}>
            <div className="nav-label" onClick={() => toggleSection('Research Tools')} role="button" tabIndex={0}>
              <BarChart3 />
              <span style={{ flex: 1 }}>Research Tools</span>
              {expandedSection === 'Research Tools' ? <ChevronDown size={14} className="chevron" /> : <ChevronRight size={14} className="chevron" />}
            </div>
            {expandedSection === 'Research Tools' && (
              <div className="nav-section-items">
                <button className={`nav-item ${active === 'charts_visualizations' ? 'selected' : ''}`} onClick={() => setActive('charts_visualizations')}>
                  <TrendingUp size={14} /> Charts & Visualizer
                </button>
                <button className={`nav-item ${active === 'research:patterns' ? 'selected' : ''}`} onClick={() => setActive('research:patterns')}>
                  <TrendingUp size={14} /> Pattern Viewer
                </button>
                <button className={`nav-item ${active === 'research:indices_patterns' ? 'selected' : ''}`} onClick={() => setActive('research:indices_patterns')}>
                  <Layers size={14} /> Indices Pattern Viewer
                </button>
                <button className={`nav-item ${active === 'research:retracement_patterns' ? 'selected' : ''}`} onClick={() => setActive('research:retracement_patterns')}>
                  <Activity size={14} /> Retracement & Speculator Behavior
                </button>
                <button className={`nav-item ${active === 'research:compare' ? 'selected' : ''}`} onClick={() => setActive('research:compare')}>
                  <Activity size={14} /> Period Comparison
                </button>
              </div>
            )}
          </section>

          <section className={`nav-section ${expandedSection === 'Reports' ? 'expanded' : 'collapsed'}`}>
            <div className="nav-label" onClick={() => toggleSection('Reports')} role="button" tabIndex={0}>
              <FileText size={14} />
              <span style={{ flex: 1 }}>Reports</span>
              {expandedSection === 'Reports' ? <ChevronDown size={14} className="chevron" /> : <ChevronRight size={14} className="chevron" />}
            </div>
            {expandedSection === 'Reports' && (
              <div className="nav-section-items">
                <button className={`nav-item ${active === 'research:market_cap_wise' ? 'selected' : ''}`} onClick={() => setActive('research:market_cap_wise')}>
                  <TrendingUp size={14} /> Top 10- by Market Cap
                </button>
                <button className={`nav-item ${active === 'research:sector_wise' ? 'selected' : ''}`} onClick={() => setActive('research:sector_wise')}>
                  <PieChart size={14} /> Top 10- by Sector
                </button>
                <button className={`nav-item ${active === 'research:penny_stocks' ? 'selected' : ''}`} onClick={() => setActive('research:penny_stocks')}>
                  <Zap size={14} /> Penny Stocks
                </button>
                <button className={`nav-item ${active === 'research:stocks_respecting_patterns' ? 'selected' : ''}`} onClick={() => setActive('research:stocks_respecting_patterns')}>
                  <Target size={14} /> Pattern Respecting Stocks
                </button>
                <button className={`nav-item ${active === 'research:sectorwise_followers' ? 'selected' : ''}`} onClick={() => setActive('research:sectorwise_followers')}>
                  <Layers size={14} /> Sectorwise Followers
                </button>
                <button className={`nav-item ${active === 'research:watchlist_monitor' ? 'selected' : ''}`} onClick={() => setActive('research:watchlist_monitor')}>
                  <Star size={14} /> Watchlist Monitor
                </button>
              </div>
            )}
          </section>

          {/* Navigation sections ordered: MASTER DATA -> RAW DATA -> CALLS -> DERIVATIVE -> Other catalog sections */}
          {(() => {
            const orderedGroups = ['Master Data']
            if (grouped['Raw data']) orderedGroups.push('Raw data')
            if (grouped['Calls']) orderedGroups.push('Calls')
            if (grouped['Derivative']) orderedGroups.push('Derivative')
            Object.keys(grouped).forEach(g => {
              if (g !== 'Master Data' && g !== 'Research Board' && g !== 'Raw data' && g !== 'Calls' && g !== 'Derivative') {
                orderedGroups.push(g)
              }
            })

            return orderedGroups.map(group => {
              const isExpanded = expandedSection === group
              if (group === 'Master Data') {
                return (
                  <section key="Master Data" className={`nav-section ${isExpanded ? 'expanded' : 'collapsed'}`}>
                    <div className="nav-label" onClick={() => toggleSection('Master Data')} role="button" tabIndex={0}>
                      <Settings2 />
                      <span style={{ flex: 1 }}>Master Data</span>
                      {isExpanded ? <ChevronDown size={14} className="chevron" /> : <ChevronRight size={14} className="chevron" />}
                    </div>
                    {isExpanded && (
                      <div className="nav-section-items">
                        <button className={`nav-item ${active === 'master:sectors' ? 'selected' : ''}`} onClick={() => setActive('master:sectors')}><Tag /> Sectors</button>
                        <button className={`nav-item ${active === 'master:tickers' ? 'selected' : ''}`} onClick={() => setActive('master:tickers')}><Globe /> Ticker Master</button>
                        <button className={`nav-item ${active === 'master:opportunities' ? 'selected' : ''}`} onClick={() => setActive('master:opportunities')}><Shield /> About Company</button>
                        <button className={`nav-item ${active === 'fno_stock_master' ? 'selected' : ''}`} onClick={() => setActive('fno_stock_master')}><Layers /> Stock Derivatives</button>
                        <button className={`nav-item ${active === 'master:indices' ? 'selected' : ''}`} onClick={() => setActive('master:indices')}><Layers /> Indices Master</button>
                        <button className={`nav-item ${active === 'fno_index_master' ? 'selected' : ''}`} onClick={() => setActive('fno_index_master')}><Layers /> Indices Derivatives</button>
                        <button className={`nav-item ${active === 'master:watchlists' ? 'selected' : ''}`} onClick={() => setActive('master:watchlists')}><BookMarked /> Watchlists</button>
                        <button className={`nav-item ${active === 'master:recommendations' ? 'selected' : ''}`} onClick={() => setActive('master:recommendations')}><Star /> Recommendations</button>
                        <button className={`nav-item ${active === 'master:users' ? 'selected' : ''}`} onClick={() => setActive('master:users')}><Users /> Users</button>
                        <button className={`nav-item ${active === 'master:aliases' ? 'selected' : ''}`} onClick={() => setActive('master:aliases')}><GitCompare /> Alternative Names</button>
                        <button className={`nav-item ${active === 'master:excluded' ? 'selected' : ''}`} onClick={() => setActive('master:excluded')}><Ban /> Excluded Tickers</button>
                        <button className={`nav-item ${active === 'master:references' ? 'selected' : ''}`} onClick={() => setActive('master:references')}><Globe /> Reference Pages</button>
                        <button className={`nav-item ${active === 'master:screener_mappings' ? 'selected' : ''}`} onClick={() => setActive('master:screener_mappings')}><ArrowRight /> Screener Mappings</button>
                      </div>
                    )}
                  </section>
                )
              }

              const items = grouped[group]
              if (!items || items.length === 0) return null
              const Icon = groupIcon[group] || TableProperties
              return (
                <section key={group} className={`nav-section ${isExpanded ? 'expanded' : 'collapsed'}`}>
                  <div className="nav-label" onClick={() => toggleSection(group)} role="button" tabIndex={0}>
                    <Icon />
                    <span style={{ flex: 1 }}>{group}</span>
                    {isExpanded ? <ChevronDown size={14} className="chevron" /> : <ChevronRight size={14} className="chevron" />}
                  </div>
                  {isExpanded && (
                    <div className="nav-section-items">
                      {items.filter(item => item.name !== 'operatorfootprint').map(item => (
                        <button key={item.name} className={`nav-item ${active === item.name ? 'selected' : ''}`} onClick={() => { setQuery(''); setActive(item.name); }}>
                          {item.label}
                        </button>
                      ))}

                    </div>
                  )}
                </section>
              )
            })
          })()}
        </nav>
        <div className="connection" title={dbInfo?.host ? `Connected to ${dbInfo.host}` : ''}>
          <i className={error ? 'offline' : ''} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span>
              {error
                ? 'Database unavailable'
                : `PostgreSQL connected ${dbInfo?.host ? `(${maskHost(dbInfo.host)})` : ''}`}
            </span>
            {!error && dbInfo?.last_data_download && (
              <span style={{ fontSize: 10, color: '#7ec8f0', fontWeight: 600, opacity: 0.9 }}>
                ⏱️ Last data download: {dbInfo.last_data_download}
              </span>
            )}
          </div>
        </div>
      </aside>

      <main>
        {/* Universal Sub-App Top Switcher Bar */}
        <div style={{ background: '#09111f', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 10, overflowX: 'auto' }}>
          <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 800, letterSpacing: 0.5, whiteSpace: 'nowrap' }}>APP SUITE:</span>
          {Object.entries(subApps).map(([sKey, sApp]) => {
            const Icon = sApp.icon
            const isSel = activeSubApp === sKey
            return (
              <button
                key={sKey}
                onClick={() => {
                  setActiveSubApp(sKey)
                  if (sApp.defaultView === 'research:search_detail') {
                    triggerSearchDetail()
                  } else {
                    setActive(sApp.defaultView)
                  }
                }}
                style={{
                  background: isSel ? 'linear-gradient(135deg, #38bdf8, #0284c7)' : 'rgba(255,255,255,0.05)',
                  color: isSel ? '#0f172a' : '#cbd5e1',
                  border: isSel ? 'none' : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  whiteSpace: 'nowrap',
                  boxShadow: isSel ? '0 4px 12px rgba(56, 189, 248, 0.3)' : 'none'
                }}
              >
                <Icon size={14} /> {sApp.title}
              </button>
            )
          })}
        </div>

        {!MASTER_PAGES.includes(active) && !active.startsWith('research:') && active !== 'charts_visualizations' && (

          <header>
            <div>
              <p className="eyebrow">{appInfo.eyebrow}</p>
              <h1>
                {active === 'dashboard' ? `${appInfo.title} overview`
                  : active === 'midcap_dashboard' ? 'Top 15 Mid-Cap Stocks'
                  : active === 'smallcap_dashboard' ? 'Top 15 Small-Cap Stocks'
                  : active === 'largecap_dashboard' ? 'Top 15 Large-Cap Stocks'
                  : active.startsWith('sector:') ? `Sector: ${activeSector}`
                  : current?.label || active}
              </h1>
              <p className="subhead">
                {active === 'dashboard' ? appInfo.description
                  : active === 'midcap_dashboard' ? 'Algorithmically filtered mid-cap momentum plays — growth-oriented setups from the Nifty Midcap universe.'
                  : active === 'smallcap_dashboard' ? 'High-growth small-cap opportunities screened from the Nifty Smallcap 100 — aggressive setups with asymmetric risk-reward.'
                  : active === 'largecap_dashboard' ? 'Institutional-grade large-cap setups screened from the Nifty 50 / Nifty 100 — stable, high-conviction swing trade opportunities.'
                  : active.startsWith('sector:') ? `Intelligence data filtered to ${activeSector} tickers`
                  : `${data?.total ?? '—'} records · Latest rows first`}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ThemeSelector currentTheme={theme} onSelectTheme={setTheme} />
              <button className="refresh" onClick={() => (['dashboard','midcap_dashboard','smallcap_dashboard','largecap_dashboard'].includes(active)) ? refreshDashboard() : load()}>
                <RefreshCw size={16} /> Refresh
              </button>
            </div>
          </header>

        )}


        {active === 'dashboard' ? (
          <Dashboard apiBase={apiBase} setActive={setActive} onSelectTicker={(t) => handleLookupTickerSelect(t)} />
        ) : active === 'midcap_dashboard' ? (
          <MidCapDashboard apiBase={apiBase} setActive={setActive} onSelectTicker={(t) => handleLookupTickerSelect(t)} />
        ) : active === 'smallcap_dashboard' ? (
          <SmallCapDashboard apiBase={apiBase} setActive={setActive} onSelectTicker={(t) => handleLookupTickerSelect(t)} />
        ) : active === 'largecap_dashboard' ? (
          <LargeCapDashboard apiBase={apiBase} setActive={setActive} onSelectTicker={(t) => handleLookupTickerSelect(t)} />
        ) : active === 'charts_visualizations' ? (
          <ChartsVisualizationsPage apiBase={apiBase} dataset={dataset} />
        ) : active.startsWith('master:') ? (
          <MasterSubmodule subView={active.replace('master:', '')} onNavigate={handleMasterNav} dataset={dataset} onSelectTicker={(t) => handleLookupTickerSelect(t)} />
        ) : active.startsWith('sector:') ? (
          <SectorIntelligencePage
            sectorName={activeSector}
            data={sectorData}
            scanTable={sectorScanTable}
            onScanTableChange={handleSectorScanChange}
          />
        ) : active === 'fno_active' ? (
          <FnoActivePage data={data} loading={loading} error={error} />
        ) : active === 'option_chain_analyzer' ? (
          <OptionChainAnalyzerPage apiBase={apiBase} initialTicker={selectedFnoTicker} dataset={dataset} />
        ) : active === 'best_option_strategy' ? (
          <BestOptionStrategyPage apiBase={apiBase} dataset={dataset} />
        ) : active === 'research:search_detail' ? (
          <ChartErrorBoundary>
            <SearchDetailPage key={`search_detail_${searchCounter}_${selectedProfileTicker || query || 'RELIANCE'}`} apiBase={apiBase} dataset={dataset} initialTicker={selectedProfileTicker || query || 'RELIANCE'} />
          </ChartErrorBoundary>
        ) : active === 'research:ticker_profile' ? (
          <TickerResearchProfilePage apiBase={apiBase} dataset={dataset} initialTicker={selectedProfileTicker} onNavigate={(tab) => setActive(tab)} />
        ) : active === 'research:patterns' ? (
          <PatternViewerPage apiBase={apiBase} dataset={dataset} />
        ) : active === 'research:indices_patterns' ? (
          <IndicesPatternViewerPage apiBase={apiBase} dataset={dataset} />
        ) : active === 'research:compare' ? (
          <ResearchBoardPage apiBase={apiBase} dataset={dataset} />
        ) : active === 'research:sector_wise' ? (
          <SectorWiseReportPage apiBase={apiBase} dataset={dataset} />
        ) : active === 'research:market_cap_wise' ? (
          <MarketCapWiseReportPage apiBase={apiBase} dataset={dataset} />
        ) : active === 'research:penny_stocks' ? (
          <PennyStocksDashboard apiBase={apiBase} setActive={setActive} onSelectTicker={(t) => handleLookupTickerSelect(t)} />
        ) : active === 'research:stocks_respecting_patterns' ? (
          <StocksRespectingPatternsPage apiBase={apiBase} dataset={dataset} />
        ) : active === 'research:sectorwise_followers' ? (
          <SectorwiseFollowersPage apiBase={apiBase} dataset={dataset} />
        ) : active === 'research:retracement_patterns' ? (
          <ChartErrorBoundary>
            <RetracementPatternPage apiBase={apiBase} dataset={dataset} onSelectTicker={(t) => handleProfileTickerSelect(t)} />
          </ChartErrorBoundary>
        ) : active === 'research:watchlist_monitor' ? (
          <WatchlistMonitorPage apiBase={apiBase} dataset={dataset} onSelectTicker={(t) => handleLookupTickerSelect(t)} />
        ) : (
          <TableView data={data} loading={loading} error={error} query={query} setQuery={setQuery} onSearch={() => load()} activeTable={active} onSelectFnoTicker={handleFnoTickerSelect} onSelectProfileTicker={handleProfileTickerSelect} dataset={dataset} searchHistory={searchHistory} addSearchHistory={addSearchHistory} />
        )}




      </main>
    </div>
  )
}

// ─── Option Trade Rationale & Setup Modal ──────────────────────────────────────
function OptionTradeNoteModal({ noteData, onClose }) {
  if (!noteData) return null
  const isCall = noteData.type === 'CALL'

  return (
    <Modal title={`⭐ Trade Setup & Technical Rationale: ${noteData.instrument}`} onClose={onClose}>
      <div style={{ padding: '4px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <span style={{
              background: isCall ? 'rgba(82,196,26,0.18)' : 'rgba(255,77,79,0.18)',
              color: isCall ? '#52c41a' : '#ff4d4f',
              padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 800, letterSpacing: 1
            }}>
              {isCall ? 'RECOMMENDED CALL BUY (BULLISH RALLY)' : 'RECOMMENDED PUT BUY (BEARISH HEDGE)'}
            </span>
            <h2 style={{ fontSize: 20, margin: '6px 0 0 0', color: '#fff', fontWeight: 700 }}>
              {noteData.instrument} Option Contract Setup
            </h2>
          </div>

          <div style={{ background: 'rgba(126,200,240,0.12)', padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(126,200,240,0.3)', textAlign: 'right' }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Expected Return</span>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#52c41a' }}>
              {noteData.projected_roi}
            </div>
          </div>
        </div>

        {/* Option Premium Target & SL Metrics Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
          <div style={{ background: 'rgba(255,255,255,0.04)', padding: 10, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>Option Entry LTP</span>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{noteData.ltp?.toFixed(2)}</div>
          </div>

          <div style={{ background: 'rgba(255,77,79,0.08)', padding: 10, borderRadius: 6, border: '1px solid rgba(255,77,79,0.25)' }}>
            <span style={{ fontSize: 11, color: '#ff4d4f' }}>Option Stop Loss (SL)</span>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#ff4d4f' }}>{noteData.option_sl?.toFixed(2)}</div>
          </div>

          <div style={{ background: 'rgba(82,196,26,0.08)', padding: 10, borderRadius: 6, border: '1px solid rgba(82,196,26,0.25)' }}>
            <span style={{ fontSize: 11, color: '#52c41a' }}>Option Target (T1 / T2)</span>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#52c41a' }}>
              {noteData.option_t1?.toFixed(2)} / {noteData.option_t2?.toFixed(2)}
            </div>
          </div>

          <div style={{ background: 'rgba(234,179,8,0.08)', padding: 10, borderRadius: 6, border: '1px solid rgba(234,179,8,0.25)' }}>
            <span style={{ fontSize: 11, color: '#eab308' }}>Risk : Reward</span>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#eab308' }}>{noteData.risk_reward}</div>
          </div>
        </div>

        {/* Spot Stock Trigger & Support Targets */}
        <div style={{ background: 'rgba(15,23,42,0.8)', padding: 12, borderRadius: 6, border: '1px solid rgba(126,200,240,0.2)', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#7ec8f0', marginBottom: 6, textTransform: 'uppercase' }}>
            Underlying Stock Spot Reference (Spot Price: {noteData.stock_spot?.toFixed(2)})
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap', color: '#cbd5e1' }}>
            <span>Stock Trigger: <b style={{ color: '#fff' }}>Above {noteData.stock_spot?.toFixed(2)}</b></span>
            <span>Stock SL: <b style={{ color: '#ff4d4f' }}>{noteData.stock_sl?.toFixed(2)}</b></span>
            <span>Stock Target: <b style={{ color: '#52c41a' }}>{noteData.stock_target?.toFixed(2)}</b></span>
          </div>
        </div>

        {/* Priority Metric: Delta Sensitivity & Intraday Rupee Gain Box */}
        <div style={{ background: 'rgba(126,200,240,0.08)', padding: 14, borderRadius: 6, border: '1px solid rgba(126,200,240,0.3)', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#7ec8f0', marginBottom: 6, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            ⚡ PRIORITY DERIVATIVE METRIC: Delta Sensitivity (Δ = {noteData.delta?.toFixed(2)})
          </div>
          <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
            • <b>Delta ($\Delta = {noteData.delta?.toFixed(2)}$)</b>: For every <b>1.00 move</b> in {noteData.instrument?.split(' ')[0]} spot stock, this contract premium gains <b>{Math.abs(noteData.delta || 0).toFixed(2)}</b>.<br />
            • <b>Intraday Gain per Lot</b>: A +1.00 move in spot generates <b>{(Math.abs(noteData.delta || 0) * (noteData.lot_size || 500)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b> profit per lot ({noteData.lot_size?.toLocaleString('en-IN')} shares).<br />
            • <b>Target Movement Profit</b>: Reaching target {noteData.stock_target?.toFixed(2)} generates <b>{(Math.abs(noteData.delta || 0) * Math.abs((noteData.stock_target || 0) - (noteData.stock_spot || 0)) * (noteData.lot_size || 500)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b> gain per lot.
          </div>
        </div>

        {/* Manageable Lot Count & Square-Off Liquidity Box */}
        <div style={{ background: 'linear-gradient(135deg, rgba(30,41,59,0.9), rgba(15,23,42,0.95))', padding: 14, borderRadius: 6, border: '1px solid rgba(82,196,26,0.3)', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#52c41a', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
              🛡️ Manageable Lot & Liquidity Square-Off Protection
            </div>
            <span style={{ background: 'rgba(82,196,26,0.2)', color: '#52c41a', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 800 }}>
              {noteData.squareoff_rating}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 10, marginBottom: 10 }}>
            <div style={{ background: 'rgba(255,255,255,0.04)', padding: 8, borderRadius: 5, border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>NSE Official Lot Size</span>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
                {noteData.lot_size?.toLocaleString('en-IN')} Shares
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.04)', padding: 8, borderRadius: 5, border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>Capital Required / Lot</span>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#7ec8f0' }}>
                {noteData.capital_per_lot?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div style={{ background: 'rgba(82,196,26,0.12)', padding: 8, borderRadius: 5, border: '1px solid rgba(82,196,26,0.3)' }}>
              <span style={{ fontSize: 10, color: '#52c41a', fontWeight: 700 }}>Max Safe Manageable Lots</span>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#52c41a' }}>
                {noteData.manageable_lots} Lots ({noteData.manageable_shares?.toLocaleString('en-IN')} Qty)
              </div>
            </div>
          </div>

          <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5, background: 'rgba(0,0,0,0.25)', padding: 8, borderRadius: 4 }}>
            💡 <b>Square-Off Liquidity Advice:</b> {noteData.squareoff_advice}
          </div>
        </div>

        {/* Technical Rationale & Explanation Box */}
        <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
            💡 Quantitative Selection Rationale:
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
            {noteData.explanation}
          </div>
        </div>

        {/* Greeks & Decay Strategy Warning */}
        <div style={{ background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.25)', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#e2e8f0' }}>
          <b style={{ color: '#eab308' }}>⏳ Holding & Decay Rules:</b>
          <div style={{ marginTop: 4, color: '#94a3b8' }}>
            • Delta (Δ): <b>{noteData.delta}</b> · Theta (Θ Decay): <b>{noteData.theta} ₹/day</b>.<br />
            • Recommended Holding: <b>{noteData.holding}</b>.<br />
            • Close long positions before weekends/holidays to eliminate Theta time-decay losses.
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Option Chain & Greek Analyzer Module ────────────────────────────────────
function OptionChainAnalyzerPage({ apiBase, initialTicker, dataset }) {
  const [selectedTradeNote, setSelectedTradeNote] = useState(null)
  const isUS = dataset === 'us_intelligence'
  const defaultTicker = isUS ? 'AAPL' : 'NIFTY'
  const initT = (initialTicker || defaultTicker).trim().toUpperCase()
  const [tickerInput, setTickerInput] = useState(initT)
  const [activeTicker, setActiveTicker] = useState(initT)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)
  const [progressStage, setProgressStage] = useState('')

  const loadChain = useCallback(targetTicker => {
    const t = (targetTicker || defaultTicker).trim().toUpperCase()
    setActiveTicker(t)
    setTickerInput(t)
    setLoading(true)
    setError('')
    setData(null)

    let p = 12
    setProgress(p)
    setProgressStage(`🔍 Step 1/4: Searching ticker '${t}' & querying database...`)

    const progressTimer = setInterval(() => {
      p += Math.floor(Math.random() * 9) + 4
      if (p < 38) {
        setProgressStage(`📥 Step 2/4: Downloading spot price & option strikes for ${t}...`)
      } else if (p < 68) {
        setProgressStage(`⚙️ Step 3/4: Computing Option Greeks (Delta Δ, Gamma Γ, Theta Θ, Vega ν)...`)
      } else if (p < 92) {
        setProgressStage(`📊 Step 4/4: Writing report to temporary table raw_ticker_option_chain_temp...`)
      }
      if (p >= 92) p = 92
      setProgress(p)
    }, 70)

    api.get(`${apiBase}/option-chain?ticker=${encodeURIComponent(t)}`)
      .then(d => {
        clearInterval(progressTimer)
        if (d.detail) throw new Error(d.detail)
        setProgress(100)
        setProgressStage(`✅ Report ready! Rendered 21 derivative contracts for ${t}`)
        setTimeout(() => {
          setData(d)
          setLoading(false)
        }, 120)
      })
      .catch(err => {
        clearInterval(progressTimer)
        setError(err.message || 'Failed to analyze option chain.')
        setLoading(false)
      })
  }, [apiBase, defaultTicker])

  useEffect(() => {
    loadChain(initialTicker || defaultTicker)
  }, [initialTicker, loadChain, defaultTicker])

  const [fnoStockList, setFnoStockList] = useState([])
  const [fnoIndexList, setFnoIndexList] = useState([])
  const [recentSearches, setRecentSearches] = useState([])

  useEffect(() => {
    api.get(`${apiBase}/fno-underlyings`)
      .then(res => {
        if (res) {
          setFnoStockList(res.stocks || [])
          setFnoIndexList(res.indices || [])
          setRecentSearches(res.recent_searches || [])
        }
      })
      .catch(() => {})
  }, [apiBase])

  return (
    <div className="option-chain-page">
      {/* Header Panel with Search & Quick Shortcuts */}
      <div className="panel" style={{ padding: '16px 20px', marginBottom: 16, background: 'linear-gradient(135deg, rgba(26,32,44,0.95), rgba(15,23,42,0.98))', border: '1px solid rgba(126,200,240,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
          <div>
            <span style={{ background: 'rgba(126,200,240,0.15)', color: '#7ec8f0', padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
              DERIVATIVE ANALYSIS MODULE
            </span>
            <h2 style={{ fontSize: 20, margin: '4px 0 0 0', color: '#fff', fontWeight: 700 }}>
              Option Chain & Greeks Analyzer (10 Strikes ITM / 10 Strikes OTM)
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Index F&O Dropdown */}
            <select
              disabled={loading}
              className="select-input"
              value={fnoIndexList.some(i => i.symbol === activeTicker) ? activeTicker : ''}
              onChange={e => {
                if (e.target.value) {
                  setTickerInput(e.target.value)
                  loadChain(e.target.value)
                }
              }}
              style={{ width: 170, padding: '8px 10px', fontSize: 13, borderRadius: 6, background: '#0f172a', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.4)', fontWeight: 600 }}
            >
              <option value="">📈 Select Index F&O...</option>
              {fnoIndexList.map(item => (
                <option key={item.symbol} value={item.symbol}>
                  {item.symbol} ({item.name})
                </option>
              ))}
            </select>

            {/* Stock F&O Dropdown */}
            <select
              disabled={loading}
              className="select-input"
              value={fnoStockList.some(s => s.symbol === activeTicker) ? activeTicker : ''}
              onChange={e => {
                if (e.target.value) {
                  setTickerInput(e.target.value)
                  loadChain(e.target.value)
                }
              }}
              style={{ width: 190, padding: '8px 10px', fontSize: 13, borderRadius: 6, background: '#0f172a', color: '#66e4ca', border: '1px solid rgba(102,228,202,0.4)', fontWeight: 600 }}
            >
              <option value="">🏢 Select Stock F&O...</option>
              {fnoStockList.map(item => (
                <option key={item.symbol} value={item.symbol}>
                  {item.symbol} - {item.name}
                </option>
              ))}
            </select>

            <div className="search" style={{ minWidth: 150 }}>
              <Search size={16} />
              <input
                value={tickerInput}
                disabled={loading}
                onChange={e => setTickerInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !loading && loadChain(tickerInput)}
                placeholder="Or type ticker..."
              />
            </div>
            <button
              className="button-primary"
              disabled={loading}
              onClick={() => !loading && loadChain(tickerInput)}
              style={{
                height: 36,
                padding: '0 16px',
                background: loading ? 'rgba(126,200,240,0.5)' : '#7ec8f0',
                color: '#0f172a',
                border: 'none',
                borderRadius: 6,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1
              }}
            >
              {loading ? '⚡ Downloading...' : 'Analyze Chain'}
            </button>
          </div>
        </div>

        {/* Quick Ticker Shortcuts (Recent Searches from last 8 hrs) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            🕒 Recent 3 Search:
          </span>
          {recentSearches.length > 0 ? (
            recentSearches.slice(0, 3).map(t => (
              <button
                key={t}
                className={`filter-btn ${activeTicker === t ? 'active' : ''}`}
                onClick={() => { setTickerInput(t); loadChain(t); }}
                style={{ fontSize: 12, padding: '3px 10px' }}
              >
                {t}
              </button>
            ))
          ) : (
            <span style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>None in last 8 hours</span>
          )}
        </div>

        {/* Dynamic Strategy Summary Header */}
        {!loading && data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Spot LTP & Recovery Target</span>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#7ec8f0', marginTop: 2 }}>
                {data.ticker} {isUS ? '$' : '₹'}{data.underlying_price?.toLocaleString(isUS ? 'en-US' : 'en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, color: '#52c41a', marginTop: 2, fontWeight: 600 }}>
                Target: {isUS ? '$' : '₹'}{data.rally_target?.toLocaleString(isUS ? 'en-US' : 'en-IN', { minimumFractionDigits: 2 })} (+3.2% Rally)
              </div>
            </div>

            <div
              style={{ background: 'rgba(82, 196, 26, 0.12)', padding: 12, borderRadius: 6, border: '1px solid rgba(82, 196, 26, 0.4)', cursor: 'pointer' }}
              onClick={() => data.best_call && setSelectedTradeNote(data.best_call)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#52c41a', textTransform: 'uppercase', fontWeight: 700 }}>⭐ BEST CHEAP OTM CALL</span>
                <span style={{ background: 'rgba(82,196,26,0.25)', color: '#52c41a', padding: '2px 6px', borderRadius: 3, fontSize: 10, fontWeight: 800 }}>
                  {data.best_call?.projected_roi}
                </span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#52c41a', marginTop: 3 }}>
                {data.best_call ? `${data.best_call.strike} CE (${isUS ? '$' : '₹'}${data.best_call.ltp})` : 'ATM CE'}
              </div>
              <div style={{ fontSize: 11, color: '#e2e8f0', marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Δ {data.best_call?.delta} · {data.best_call?.prob}% Win</span>
                <span style={{ color: '#7ec8f0', textDecoration: 'underline', fontSize: 10, fontWeight: 700 }}>View Trade Note ➔</span>
              </div>
            </div>

            <div
              style={{ background: 'rgba(255, 77, 79, 0.12)', padding: 12, borderRadius: 6, border: '1px solid rgba(255, 77, 79, 0.4)', cursor: 'pointer' }}
              onClick={() => data.best_put && setSelectedTradeNote(data.best_put)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: '#ff4d4f', textTransform: 'uppercase', fontWeight: 700 }}>⭐ BEST CHEAP OTM PUT</span>
                <span style={{ background: 'rgba(255,77,79,0.25)', color: '#ff4d4f', padding: '2px 6px', borderRadius: 3, fontSize: 10, fontWeight: 800 }}>
                  {data.best_put?.projected_roi}
                </span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#ff4d4f', marginTop: 3 }}>
                {data.best_put ? `${data.best_put.strike} PE (${isUS ? '$' : '₹'}${data.best_put.ltp})` : 'ATM PE'}
              </div>
              <div style={{ fontSize: 11, color: '#e2e8f0', marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Δ {data.best_put?.delta} · {data.best_put?.prob}% Win</span>
                <span style={{ color: '#7ec8f0', textDecoration: 'underline', fontSize: 10, fontWeight: 700 }}>View Trade Note ➔</span>
              </div>
            </div>

            <div style={{ background: 'rgba(234, 179, 8, 0.12)', padding: 12, borderRadius: 6, border: '1px solid rgba(234, 179, 8, 0.4)' }}>
              <span style={{ fontSize: 11, color: '#eab308', textTransform: 'uppercase', fontWeight: 700 }}>DIRECTIONAL BIAS & DURATION</span>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginTop: 3 }}>
                {data.directional_bias_label || '🔥 STRONG BULLISH RALLY EXPECTED'}
              </div>
              <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 2 }}>
                Hold 1-2 Days (Exit before Friday close to avoid Theta decay)
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Animated Download & Calculation Progress Bar */}
      {loading && (
        <section className="panel" style={{ padding: '32px 24px', margin: '16px 0', background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.98))', border: '1px solid rgba(126,200,240,0.3)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
            <RefreshCw size={22} className="spin" style={{ color: '#7ec8f0' }} />
            <h3 style={{ fontSize: 18, margin: 0, color: '#fff', fontWeight: 700 }}>
              Analyzing Live Derivatives for <span style={{ color: '#7ec8f0' }}>{activeTicker}</span>
            </h3>
          </div>

          <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 18, fontWeight: 500 }}>
            {progressStage}
          </div>

          <div style={{ width: '100%', maxWidth: 650, height: 12, background: 'rgba(255,255,255,0.08)', borderRadius: 6, margin: '0 auto', overflow: 'hidden', border: '1px solid rgba(126,200,240,0.2)' }}>
            <div style={{
              width: `${progress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #7ec8f0 0%, #52c41a 100%)',
              borderRadius: 6,
              transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 0 14px rgba(126,200,240,0.7)'
            }} />
          </div>

          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10, fontWeight: 600 }}>
            {progress}% Completed · Fetching 10 Strikes ITM & 10 Strikes OTM
          </div>
        </section>
      )}

      {/* Main Option Chain Table Grid */}
      <section className="panel data-panel">
        {error && <div className="state error">{error}</div>}
        {!loading && !error && data && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th colSpan={5} style={{ background: 'rgba(82, 196, 26, 0.12)', color: '#52c41a', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
                    CALL OPTIONS (CE GREEKS & VOLUME)
                  </th>
                  <th colSpan={2} style={{ background: 'rgba(126, 200, 240, 0.15)', color: '#7ec8f0', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
                    STRIKE & MONEYNESS
                  </th>
                  <th colSpan={5} style={{ background: 'rgba(255, 77, 79, 0.12)', color: '#ff4d4f', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
                    PUT OPTIONS (PE GREEKS & VOLUME)
                  </th>
                  <th colSpan={2} style={{ background: 'rgba(234, 179, 8, 0.12)', color: '#eab308', textAlign: 'center', fontSize: 12, fontWeight: 700 }}>
                    STRATEGY & WIN PROBABILITY
                  </th>
                </tr>
                <tr>
                  <th style={{ fontSize: 11 }}>CE Delta (Δ)</th>
                  <th style={{ fontSize: 11 }}>CE Theta (Θ)</th>
                  <th style={{ fontSize: 11 }}>CE IV %</th>
                  <th style={{ fontSize: 11 }}>CE Vol / OI</th>
                  <th style={{ fontSize: 11 }}>CE LTP</th>
                  <th style={{ fontSize: 12, color: '#7ec8f0' }}>Strike Price</th>
                  <th style={{ fontSize: 11 }}>Moneyness</th>
                  <th style={{ fontSize: 11 }}>PE LTP</th>
                  <th style={{ fontSize: 11 }}>PE Vol / OI</th>
                  <th style={{ fontSize: 11 }}>PE Delta (Δ)</th>
                  <th style={{ fontSize: 11 }}>PE Theta (Θ)</th>
                  <th style={{ fontSize: 11 }}>PE IV %</th>
                  <th style={{ fontSize: 11 }}>Win Prob %</th>
                  <th style={{ fontSize: 11 }}>Recommended Action & Duration</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => {
                  const isRecCall = r.is_recommended_call
                  const isRecPut = r.is_recommended_put
                  const isATM = r.moneyness.includes('ATM')
                  const isWin = r.win_probability >= 70

                  let rowStyle = { background: 'transparent' }
                  if (isRecCall) {
                    rowStyle = { background: 'rgba(82, 196, 26, 0.16)', borderLeft: '4px solid #52c41a', cursor: 'pointer' }
                  } else if (isRecPut) {
                    rowStyle = { background: 'rgba(255, 77, 79, 0.16)', borderLeft: '4px solid #ff4d4f', cursor: 'pointer' }
                  } else if (isATM) {
                    rowStyle = { background: 'rgba(126, 200, 240, 0.08)' }
                  }

                  const handleRowClick = () => {
                    if (isRecCall && data.best_call) setSelectedTradeNote(data.best_call)
                    if (isRecPut && data.best_put) setSelectedTradeNote(data.best_put)
                  }

                  return (
                    <tr key={i} className="data-row" style={rowStyle} onClick={handleRowClick}>
                      <td style={{ color: '#7ec8f0', fontWeight: 600 }}>{r.ce_delta?.toFixed(2)}</td>
                      <td style={{ color: '#ff4d4f' }}>{r.ce_theta?.toFixed(2)} /d</td>
                      <td style={{ color: '#cbd5e1' }}>{r.ce_iv?.toFixed(1)}%</td>
                      <td>
                        <div style={{ fontSize: 11 }}>
                          <b style={{ color: '#e2e8f0' }}>V: {r.ce_volume?.toLocaleString('en-IN')}</b>
                          <div style={{ color: '#94a3b8' }}>OI: {r.ce_oi?.toLocaleString('en-IN')}</div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <b style={{ color: '#52c41a', fontSize: 13 }}>{r.ce_ltp?.toFixed(2)}</b>
                          {isRecCall && (
                            <span style={{ background: '#52c41a', color: '#0f172a', padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 900, letterSpacing: 0.5, cursor: 'pointer' }}>
                              BEST CALL 🛈
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: r.ce_pchange >= 0 ? '#52c41a' : '#ff4d4f' }}>
                          ({r.ce_pchange >= 0 ? '+' : ''}{r.ce_pchange}%)
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', background: isRecCall ? 'rgba(82,196,26,0.25)' : isRecPut ? 'rgba(255,77,79,0.25)' : isATM ? 'rgba(126, 200, 240, 0.2)' : 'rgba(255,255,255,0.03)' }}>
                        <b style={{ color: '#fff', fontSize: 14, fontFamily: "'DM Mono'" }}>{r.strike_price}</b>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, color: isRecCall ? '#52c41a' : isRecPut ? '#ff4d4f' : isATM ? '#7ec8f0' : '#cbd5e1', fontWeight: (isRecCall || isRecPut || isATM) ? 700 : 400 }}>
                          {r.moneyness}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <b style={{ color: '#ff4d4f', fontSize: 13 }}>{r.pe_ltp?.toFixed(2)}</b>
                          {isRecPut && (
                            <span style={{ background: '#ff4d4f', color: '#fff', padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 900, letterSpacing: 0.5, cursor: 'pointer' }}>
                              BEST PUT 🛈
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: r.pe_pchange >= 0 ? '#52c41a' : '#ff4d4f' }}>
                          ({r.pe_pchange >= 0 ? '+' : ''}{r.pe_pchange}%)
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: 11 }}>
                          <b style={{ color: '#e2e8f0' }}>V: {r.pe_volume?.toLocaleString('en-IN')}</b>
                          <div style={{ color: '#94a3b8' }}>OI: {r.pe_oi?.toLocaleString('en-IN')}</div>
                        </div>
                      </td>
                      <td style={{ color: '#7ec8f0', fontWeight: 600 }}>{r.pe_delta?.toFixed(2)}</td>
                      <td style={{ color: '#ff4d4f' }}>{r.pe_theta?.toFixed(2)} /d</td>
                      <td style={{ color: '#cbd5e1' }}>{r.pe_iv?.toFixed(1)}%</td>
                      <td>
                        <span className={`badge ${isWin ? 'strong-buy' : 'strong-sell'}`} style={{ fontSize: 11 }}>
                          {r.win_probability}% Win
                        </span>
                      </td>
                      <td style={{ fontSize: 11, maxWidth: 220, lineHeight: 1.3 }}>
                        <b style={{ color: isRecCall ? '#52c41a' : isRecPut ? '#ff4d4f' : isWin ? '#52c41a' : '#ff4d4f' }}>
                          {isRecCall ? '⭐ RECOMMENDED BUY (Click for Setup Note)' : isRecPut ? '⭐ RECOMMENDED BUY (Click for Setup Note)' : r.recommended_action}
                        </b>
                        <div style={{ color: '#94a3b8' }}>{r.holding_duration}</div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedTradeNote && (
        <OptionTradeNoteModal noteData={selectedTradeNote} onClose={() => setSelectedTradeNote(null)} />
      )}
    </div>
  )
}

// ─── Best Option Strategy Engine Module ────────────────────────────────────
function BestOptionStrategyPage({ apiBase, dataset }) {
  const isUS = dataset === 'us_intelligence'
  const defaultTicker = isUS ? 'AAPL' : 'HDFCBANK'
  const [tickerInput, setTickerInput] = useState(defaultTicker)
  const [activeTicker, setActiveTicker] = useState(defaultTicker)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)
  const [progressStage, setProgressStage] = useState('')
  const [selectedStratId, setSelectedStratId] = useState('bull_call_spread')

  const loadStrategy = useCallback(targetTicker => {
    const t = (targetTicker || defaultTicker).trim().toUpperCase()
    setActiveTicker(t)
    setTickerInput(t)
    setLoading(true)
    setError('')
    setData(null)

    let p = 15
    setProgress(p)
    setProgressStage(`🔍 Step 1/4: Searching derivative database for ${t}...`)

    const progressTimer = setInterval(() => {
      p += Math.floor(Math.random() * 8) + 6
      if (p < 40) {
        setProgressStage(`📥 Step 2/4: Fetching live spot price & option chain Greeks for ${t}...`)
      } else if (p < 70) {
        setProgressStage(`📊 Step 3/4: Calculating PCR ratio, IV volatility skew & OI buildup...`)
      } else if (p < 92) {
        setProgressStage(`⚙️ Step 4/4: Simulating multi-leg payoff matrix & win probabilities...`)
      }
      if (p >= 92) p = 92
      setProgress(p)
    }, 150)

    fetch(`${apiBase}/best-strategy?ticker=${encodeURIComponent(t)}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`)
        return res.json()
      })
      .then(json => {
        clearInterval(progressTimer)
        setProgress(100)
        setProgressStage(`✅ Strategy evaluation complete for ${t}!`)
        setTimeout(() => {
          setData(json)
          setLoading(false)
        }, 200)
      })
      .catch(err => {
        clearInterval(progressTimer)
        setError(`Failed to evaluate strategies for ${t}: ${err.message}`)
        setLoading(false)
      })
  }, [apiBase, defaultTicker])

  useEffect(() => {
    loadStrategy(defaultTicker)
  }, [defaultTicker, loadStrategy])

  const handleSubmit = e => {
    e.preventDefault()
    if (tickerInput.trim()) loadStrategy(tickerInput)
  }

  const quickTickers = isUS
    ? ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AMD', 'JPM', 'SPY', 'QQQ']
    : ['HDFCBANK', 'ABB', 'AUBANK', 'NIFTY', 'BANKNIFTY', 'RELIANCE', 'INFY', 'TATAMOTORS', 'SBIN', 'ICICIBANK', 'BEL']

  const [fnoStockList, setFnoStockList] = useState([])
  const [fnoIndexList, setFnoIndexList] = useState([])
  const [recentSearches, setRecentSearches] = useState([])

  useEffect(() => {
    api.get(`${apiBase}/fno-underlyings`)
      .then(res => {
        if (res) {
          setFnoStockList(res.stocks || [])
          setFnoIndexList(res.indices || [])
          setRecentSearches(res.recent_searches || [])
        }
      })
      .catch(() => {})
  }, [apiBase])

  const selectedStrat = data?.strategies?.find(s => s.id === selectedStratId) || data?.strategies?.[0]

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="panel" style={{ padding: '20px 24px', background: 'linear-gradient(135deg, rgba(15,23,42,0.9), rgba(30,41,59,0.95))', border: '1px solid rgba(126,200,240,0.25)', borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <span className="badge primary" style={{ fontSize: 11, letterSpacing: 1 }}>QUANTITATIVE DERIVATIVE ENGINE</span>
            <h1 style={{ fontSize: 22, margin: '6px 0 0 0', color: '#fff', fontWeight: 700 }}>
              🎯 Best Option Strategy Recommendation Engine
            </h1>
            <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: 13 }}>
              Multi-factor evaluation of Greeks, Volatility Skew, PCR & OI to maximize win probability and eliminate loss exposure.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Index F&O Dropdown */}
            <select
              disabled={loading}
              className="select-input"
              value={fnoIndexList.some(i => i.symbol === activeTicker) ? activeTicker : ''}
              onChange={e => {
                if (e.target.value) {
                  setTickerInput(e.target.value)
                  loadStrategy(e.target.value)
                }
              }}
              style={{ width: 170, padding: '8px 10px', fontSize: 13, borderRadius: 6, background: '#0f172a', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.4)', fontWeight: 600 }}
            >
              <option value="">📈 Select Index F&O...</option>
              {fnoIndexList.map(item => (
                <option key={item.symbol} value={item.symbol}>
                  {item.symbol} ({item.name})
                </option>
              ))}
            </select>

            {/* Stock F&O Dropdown */}
            <select
              disabled={loading}
              className="select-input"
              value={fnoStockList.some(s => s.symbol === activeTicker) ? activeTicker : ''}
              onChange={e => {
                if (e.target.value) {
                  setTickerInput(e.target.value)
                  loadStrategy(e.target.value)
                }
              }}
              style={{ width: 190, padding: '8px 10px', fontSize: 13, borderRadius: 6, background: '#0f172a', color: '#66e4ca', border: '1px solid rgba(102,228,202,0.4)', fontWeight: 600 }}
            >
              <option value="">🏢 Select Stock F&O...</option>
              {fnoStockList.map(item => (
                <option key={item.symbol} value={item.symbol}>
                  {item.symbol} - {item.name}
                </option>
              ))}
            </select>

            <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                disabled={loading}
                className="search-input"
                placeholder="Or type ticker..."
                value={tickerInput}
                onChange={e => setTickerInput(e.target.value)}
                style={{ width: 140, padding: '8px 12px', fontSize: 13, borderRadius: 6 }}
              />
              <button
                type="submit"
                disabled={loading}
                className="filter-btn active"
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  borderRadius: 6,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1
                }}
              >
                {loading ? '⚡ Evaluating...' : 'Evaluate'}
              </button>
            </form>
          </div>
        </div>

        {/* Quick Ticker Selection Buttons (Recent Searches from last 8 hrs) */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            🕒 Recent 3 Search:
          </span>
          {recentSearches.length > 0 ? (
            recentSearches.slice(0, 3).map(t => (
              <button
                key={t}
                disabled={loading}
                className={`filter-btn ${activeTicker === t ? 'active' : ''}`}
                onClick={() => { if (!loading) { setTickerInput(t); loadStrategy(t); } }}
                style={{ fontSize: 12, padding: '3px 10px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
              >
                {t}
              </button>
            ))
          ) : (
            <span style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>None in last 8 hours</span>
          )}
        </div>

        {/* Market Environment Summary */}
        {!loading && data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>Spot LTP & Recovery Target</span>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#7ec8f0', marginTop: 2 }}>
                {data.ticker} {isUS ? '$' : '₹'}{data.underlying_price?.toLocaleString(isUS ? 'en-US' : 'en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ fontSize: 11, color: '#52c41a', marginTop: 2, fontWeight: 600 }}>
                Target: {isUS ? '$' : '₹'}{data.rally_target?.toLocaleString(isUS ? 'en-US' : 'en-IN', { minimumFractionDigits: 2 })} (+3.4%)
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>PCR Ratio & Volatility</span>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginTop: 2 }}>
                PCR: {data.pcr_ratio} · IV: {data.iv_level}%
              </div>
              <div style={{ fontSize: 11, color: '#eab308', marginTop: 2 }}>
                {data.iv_rating} ({data.iv_level < 22 ? 'Low IV Spread Advantage' : 'High IV Seller Opportunity'})
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: 10, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase' }}>{isUS ? 'US Market Contract Size' : 'NSE Official Lot Size'}</span>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginTop: 2 }}>
                {data.lot_size?.toLocaleString(isUS ? 'en-US' : 'en-IN')} Shares / Lot
              </div>
              <div style={{ fontSize: 11, color: '#52c41a', marginTop: 2 }}>
                Safe Limit: 5 Lots (Square-off Protected)
              </div>
            </div>

            <div style={{ background: 'rgba(82, 196, 26, 0.12)', padding: 10, borderRadius: 6, border: '1px solid rgba(82, 196, 26, 0.3)' }}>
              <span style={{ fontSize: 10, color: '#52c41a', textTransform: 'uppercase', fontWeight: 700 }}>Market Directional Bias</span>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginTop: 2 }}>
                {data.market_bias_label}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {loading && (
        <section className="panel" style={{ padding: '32px 24px', margin: '16px 0', background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.98))', border: '1px solid rgba(126,200,240,0.3)', borderRadius: 8, textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
            <RefreshCw size={22} className="spin" style={{ color: '#7ec8f0' }} />
            <h3 style={{ fontSize: 18, margin: 0, color: '#fff', fontWeight: 700 }}>
              Evaluating Best Option Strategies for <span style={{ color: '#7ec8f0' }}>{activeTicker}</span>
            </h3>
          </div>
          <div style={{ fontSize: 13, color: '#cbd5e1', marginBottom: 18, fontWeight: 500 }}>
            {progressStage}
          </div>
          <div style={{ width: '100%', maxWidth: 650, height: 12, background: 'rgba(255,255,255,0.08)', borderRadius: 6, margin: '0 auto', overflow: 'hidden', border: '1px solid rgba(126,200,240,0.2)' }}>
            <div style={{
              width: `${progress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #7ec8f0 0%, #52c41a 100%)',
              borderRadius: 6,
              transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 0 14px rgba(126,200,240,0.7)'
            }} />
          </div>
        </section>
      )}

      {/* Strategies Selection Cards Grid */}
      {!loading && !error && data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            {data.strategies.map(s => {
              const isSelected = s.id === (selectedStrat?.id || 'bull_call_spread')
              return (
                <div
                  key={s.id}
                  onClick={() => setSelectedStratId(s.id)}
                  style={{
                    background: isSelected ? 'rgba(82, 196, 26, 0.14)' : 'rgba(30, 41, 59, 0.6)',
                    border: isSelected ? '2px solid #52c41a' : '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 8,
                    padding: 14,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease-in-out',
                    boxShadow: isSelected ? '0 0 16px rgba(82, 196, 26, 0.3)' : 'none'
                  }}
                >
                  <div style={{ fontSize: 10, color: isSelected ? '#52c41a' : '#94a3b8', fontWeight: 800, letterSpacing: 0.5 }}>
                    {s.tag}
                  </div>
                  <h3 style={{ fontSize: 16, margin: '4px 0 2px 0', color: '#fff', fontWeight: 700 }}>
                    {s.name}
                  </h3>
                  <div style={{ fontSize: 12, color: '#7ec8f0', fontWeight: 600, marginBottom: 8 }}>
                    {s.win_probability}% Win Prob · {s.risk_reward} R:R
                  </div>
                  <div style={{ fontSize: 11, color: '#cbd5e1', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
                    <b>Max Profit:</b> <span style={{ color: '#52c41a' }}>{s.max_profit}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Selected Strategy Deep Analysis & Payoff Breakdown Panel */}
          {selectedStrat && (
            <section className="panel" style={{ padding: 24, background: 'linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.98))', border: '1px solid rgba(82,196,26,0.4)', borderRadius: 8 }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <span style={{ background: 'rgba(82,196,26,0.2)', color: '#52c41a', padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>
                    {selectedStrat.tag}
                  </span>
                  <h2 style={{ fontSize: 22, margin: '6px 0 0 0', color: '#fff', fontWeight: 700 }}>
                    {selectedStrat.name} Strategy Execution Plan
                  </h2>
                </div>
                <div style={{ background: 'rgba(126,200,240,0.12)', padding: '8px 16px', borderRadius: 6, border: '1px solid rgba(126,200,240,0.3)', textAlign: 'right' }}>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>Winning Probability</span>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#52c41a' }}>
                    {selectedStrat.win_probability}% Win Rate
                  </div>
                </div>
              </div>

              {/* Multi-Leg Construction Table */}
              <div style={{ marginBottom: 20 }}>
                <h4 style={{ fontSize: 13, color: '#7ec8f0', textTransform: 'uppercase', marginBottom: 10, fontWeight: 700 }}>
                  📋 Multi-Leg Execution Order Construction:
                </h4>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ fontSize: 11 }}>Action</th>
                        <th style={{ fontSize: 11 }}>Quantity</th>
                        <th style={{ fontSize: 11 }}>Instrument Contract</th>
                        <th style={{ fontSize: 11 }}>Premium Price (LTP)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedStrat.legs.map((leg, idx) => (
                        <tr key={idx}>
                          <td>
                            <span style={{
                              background: leg.action === 'BUY' ? 'rgba(82,196,26,0.2)' : 'rgba(255,77,79,0.2)',
                              color: leg.action === 'BUY' ? '#52c41a' : '#ff4d4f',
                              padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 800
                            }}>
                              {leg.action}
                            </span>
                          </td>
                          <td style={{ color: '#fff', fontWeight: 600 }}>{leg.qty}</td>
                          <td style={{ color: '#7ec8f0', fontWeight: 700, fontFamily: "'DM Mono'" }}>{leg.instrument}</td>
                          <td style={{ color: '#52c41a', fontWeight: 700 }}>{leg.price}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial Risk & Payoff Metrics Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                <div style={{ background: 'rgba(255,255,255,0.04)', padding: 12, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>Net Premium Cost</span>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginTop: 2 }}>{selectedStrat.net_cost}</div>
                </div>

                <div style={{ background: 'rgba(82,196,26,0.1)', padding: 12, borderRadius: 6, border: '1px solid rgba(82,196,26,0.3)' }}>
                  <span style={{ fontSize: 11, color: '#52c41a', fontWeight: 700 }}>Max Profit (Pass Scenario)</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#52c41a', marginTop: 2 }}>{selectedStrat.max_profit}</div>
                </div>

                <div style={{ background: 'rgba(255,77,79,0.1)', padding: 12, borderRadius: 6, border: '1px solid rgba(255,77,79,0.3)' }}>
                  <span style={{ fontSize: 11, color: '#ff4d4f', fontWeight: 700 }}>Max Risk (Fail Scenario)</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#ff4d4f', marginTop: 2 }}>{selectedStrat.max_loss}</div>
                </div>

                <div style={{ background: 'rgba(234,179,8,0.1)', padding: 12, borderRadius: 6, border: '1px solid rgba(234,179,8,0.3)' }}>
                  <span style={{ fontSize: 11, color: '#eab308', fontWeight: 700 }}>Breakeven Spot Price</span>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#eab308', marginTop: 2 }}>{isUS ? '$' : '₹'}{selectedStrat.breakeven}</div>
                </div>
              </div>

              {/* WHAT IF IT PASSES vs WHAT IF IT FAILS Analysis Box */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginBottom: 20 }}>
                <div style={{ background: 'rgba(82,196,26,0.08)', padding: 14, borderRadius: 6, border: '1px solid rgba(82,196,26,0.3)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#52c41a', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    🟢 WHAT IF STRATEGY PASSES (TARGET SCENARIO):
                  </div>
                  <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.5 }}>
                    {selectedStrat.pass_scenario}
                  </div>
                </div>

                <div style={{ background: 'rgba(255,77,79,0.08)', padding: 14, borderRadius: 6, border: '1px solid rgba(255,77,79,0.3)' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#ff4d4f', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    🔴 WHAT IF STRATEGY FAILS (STOP LOSS SCENARIO):
                  </div>
                  <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.5 }}>
                    {selectedStrat.fail_scenario}
                  </div>
                </div>
              </div>

              {/* Rationale & Greeks Strategy Advice */}
              <div style={{ background: 'rgba(15,23,42,0.8)', padding: 14, borderRadius: 6, border: '1px solid rgba(126,200,240,0.2)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#7ec8f0', marginBottom: 4 }}>
                  💡 Quantitative Rationale & Greeks Sensitivity:
                </div>
                <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                  {selectedStrat.rationale}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

// ─── FNO Active Derivatives Page ────────────────────────────────────────────────
function FnoActivePage({ data, loading, error }) {
  const [filterType, setFilterType] = useState('ALL') // 'ALL', 'CALL', 'PUT', 'WIN_BET', 'RISK_BET'
  const [sortKey, setSortKey] = useState('rank')
  const [sortAsc, setSortAsc] = useState(true)

  const rows = useMemo(() => {
    if (!data?.rows) return []
    let list = [...data.rows]

    if (filterType === 'CALL') list = list.filter(r => r.contract_type === 'CALL')
    if (filterType === 'PUT') list = list.filter(r => r.contract_type === 'PUT')
    if (filterType === 'WIN_BET') list = list.filter(r => String(r.bet_category).includes('Win Bet'))
    if (filterType === 'RISK_BET') list = list.filter(r => String(r.bet_category).includes('Risk Bet'))

    if (sortKey) {
      list.sort((a, b) => {
        const valA = a[sortKey] ?? ''
        const valB = b[sortKey] ?? ''
        if (typeof valA === 'number' && typeof valB === 'number') {
          return (valA - valB) * (sortAsc ? 1 : -1)
        }
        return String(valA).localeCompare(String(valB), undefined, { numeric: true }) * (sortAsc ? 1 : -1)
      })
    }
    return list
  }, [data?.rows, filterType, sortKey, sortAsc])

  const handleSort = key => {
    setSortAsc(k => sortKey === key ? !sortAsc : true)
    setSortKey(key)
  }

  const callCount = useMemo(() => (data?.rows || []).filter(r => r.contract_type === 'CALL').length, [data?.rows])
  const putCount = useMemo(() => (data?.rows || []).filter(r => r.contract_type === 'PUT').length, [data?.rows])
  const winBetCount = useMemo(() => (data?.rows || []).filter(r => String(r.bet_category).includes('Win Bet')).length, [data?.rows])
  const riskBetCount = useMemo(() => (data?.rows || []).filter(r => String(r.bet_category).includes('Risk Bet')).length, [data?.rows])

  return (
    <div className="fno-active-page">
      {/* Strategy & Greeks Insight Banner */}
      <div className="panel" style={{ padding: '16px 20px', marginBottom: 16, background: 'linear-gradient(135deg, rgba(26,32,44,0.95), rgba(15,23,42,0.98))', border: '1px solid rgba(126,200,240,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ background: 'rgba(126,200,240,0.15)', color: '#7ec8f0', padding: '4px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
              F&O DERIVATIVE GREEKS & DECAY ANALYTICS
            </span>
            <h2 style={{ fontSize: 18, margin: 0, color: '#fff', fontWeight: 700 }}>
              Top Active Calls (15) & Puts (15)
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className={`filter-btn ${filterType === 'ALL' ? 'active' : ''}`} onClick={() => setFilterType('ALL')}>All ({data?.rows?.length || 0})</button>
            <button className={`filter-btn buy ${filterType === 'CALL' ? 'active' : ''}`} onClick={() => setFilterType('CALL')}>Top 15 Calls ({callCount})</button>
            <button className={`filter-btn sell ${filterType === 'PUT' ? 'active' : ''}`} onClick={() => setFilterType('PUT')}>Top 15 Puts ({putCount})</button>
            <button className={`filter-btn strong-buy ${filterType === 'WIN_BET' ? 'active' : ''}`} onClick={() => setFilterType('WIN_BET')}>Win Bets ({winBetCount})</button>
            <button className={`filter-btn strong-sell ${filterType === 'RISK_BET' ? 'active' : ''}`} onClick={() => setFilterType('RISK_BET')}>Risk Bets ({riskBetCount})</button>
          </div>
        </div>

        {/* Weekend Decay Insight Rule Box */}
        <div style={{ background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.25)', borderRadius: 6, padding: '10px 14px', fontSize: 13, color: '#e2e8f0', lineHeight: 1.5 }}>
          <b style={{ color: '#eab308' }}>⚠️ Weekend / Holiday Time Decay Warning (Theta Decay Speed):</b>
          <span style={{ marginLeft: 6 }}>
            Options automatically lose value over weekends (Friday close ➔ Monday open) due to <b>Theta (Θ) time decay</b> even if stock prices stay flat.
            Buying OTM calls/puts before weekends carries high auto-decay loss. <b>Option Selling (Theta Harvest)</b> or <b>In-The-Money (ITM) spreads</b> provide higher win probability.
          </span>
        </div>
      </div>

      {/* Main Table */}
      <section className="panel data-panel">
        {loading && <div className="state">Loading F&O Active derivative data…</div>}
        {error && <div className="state error">{error}</div>}
        {!loading && !error && data && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th onClick={() => handleSort('rank')} style={{ cursor: 'pointer', width: 50 }}># Rank</th>
                  <th onClick={() => handleSort('contract_type')} style={{ cursor: 'pointer' }}>Type</th>
                  <th onClick={() => handleSort('ticker')} style={{ cursor: 'pointer' }}>Ticker & Strike</th>
                  <th onClick={() => handleSort('underlying_price')} style={{ cursor: 'pointer' }}>Underlying LTP</th>
                  <th onClick={() => handleSort('ltp')} style={{ cursor: 'pointer' }}>Option LTP</th>
                  <th onClick={() => handleSort('volume')} style={{ cursor: 'pointer' }}>Volume / OI</th>
                  <th onClick={() => handleSort('pcr')} style={{ cursor: 'pointer' }}>PCR</th>
                  <th onClick={() => handleSort('delta')} style={{ cursor: 'pointer' }}>Delta (Δ)</th>
                  <th onClick={() => handleSort('gamma')} style={{ cursor: 'pointer' }}>Gamma (Γ)</th>
                  <th onClick={() => handleSort('theta')} style={{ cursor: 'pointer' }}>Theta (Θ Decay)</th>
                  <th onClick={() => handleSort('vega')} style={{ cursor: 'pointer' }}>Vega (ν)</th>
                  <th onClick={() => handleSort('implied_volatility')} style={{ cursor: 'pointer' }}>IV %</th>
                  <th onClick={() => handleSort('weekend_decay_risk')} style={{ cursor: 'pointer' }}>Weekend Decay Risk</th>
                  <th onClick={() => handleSort('bet_category')} style={{ cursor: 'pointer' }}>Bet Category</th>
                  <th onClick={() => handleSort('buildup_signal')} style={{ cursor: 'pointer' }}>Signal</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const isCall = row.contract_type === 'CALL'
                  const isWinBet = String(row.bet_category || '').includes('Win Bet')
                  const isCriticalDecay = String(row.weekend_decay_risk || '').includes('CRITICAL') || String(row.weekend_decay_risk || '').includes('HIGH')
                  return (
                    <tr key={index} className="data-row">
                      <td style={{ fontWeight: 700, color: '#7ec8f0' }}>#{row.rank}</td>
                      <td>
                        <span className={`badge ${isCall ? 'buy' : 'sell'}`} style={{ fontWeight: 700 }}>
                          {row.contract_type} ({row.option_type})
                        </span>
                      </td>
                      <td>
                        <div>
                          <b style={{ color: '#fff', fontSize: 13, fontFamily: "'DM Mono'" }}>{row.ticker} {row.most_active_strike} {row.option_type}</b>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>Exp: {row.expiry_date}</div>
                        </div>
                      </td>
                      <td>
                        <div>
                          <b style={{ color: '#e2e8f0' }}>₹{row.underlying_price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{row.strike_distance_pct > 0 ? `+${row.strike_distance_pct}% OTM` : `${row.strike_distance_pct}% ATM`}</div>
                        </div>
                      </td>
                      <td>
                        <div>
                          <b style={{ color: isCall ? '#52c41a' : '#ff4d4f' }}>₹{row.ltp?.toFixed(2)}</b>
                          <span style={{ fontSize: 11, marginLeft: 4, color: row.pchange >= 0 ? '#52c41a' : '#ff4d4f' }}>
                            ({row.pchange >= 0 ? '+' : ''}{row.pchange}%)
                          </span>
                        </div>
                      </td>
                      <td>
                        <div>
                          <b style={{ color: '#cbd5e1' }}>Vol: {row.volume?.toLocaleString('en-IN')}</b>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>OI: {row.open_interest?.toLocaleString('en-IN')}</div>
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge ${row.pcr >= 1.0 ? 'buy' : 'sell'}`} style={{ fontSize: 11 }}>
                          {row.pcr?.toFixed(2)}
                        </span>
                      </td>
                      <td style={{ color: '#7ec8f0', fontWeight: 600 }}>{row.delta?.toFixed(2)}</td>
                      <td style={{ color: '#cbd5e1' }}>{row.gamma?.toFixed(4)}</td>
                      <td style={{ color: isCriticalDecay ? '#ff4d4f' : '#faad14', fontWeight: 700 }}>
                        {row.theta?.toFixed(2)} ₹/day
                      </td>
                      <td style={{ color: '#cbd5e1' }}>{row.vega?.toFixed(1)}</td>
                      <td style={{ color: '#e2e8f0' }}>{row.implied_volatility?.toFixed(1)}%</td>
                      <td>
                        <span style={{
                          background: isCriticalDecay ? 'rgba(255, 77, 79, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                          color: isCriticalDecay ? '#ff4d4f' : '#cbd5e1',
                          padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600
                        }}>
                          {row.weekend_decay_risk}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${isWinBet ? 'strong-buy' : 'strong-sell'}`} style={{ fontSize: 11 }}>
                          {row.bet_category}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${signalTone(row.buildup_signal)}`} style={{ fontSize: 11 }}>
                          {row.buildup_signal}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

// ─── Trade Insight Cell Component ──────────────────────────────────────────────
function TradeInsightCell({ ticker, insight }) {
  const [showModal, setShowModal] = useState(false)
  const str = String(insight || '—')

  return (
    <>
      <button
        type="button"
        onClick={() => setShowModal(true)}
        title="Click to view full Trade Insight & Technical Rationale"
        style={{
          background: 'rgba(56, 189, 248, 0.12)',
          border: '1px solid rgba(56, 189, 248, 0.35)',
          color: '#38bdf8',
          borderRadius: 6,
          padding: '4px 10px',
          cursor: 'pointer',
          fontSize: '0.82rem',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          transition: 'all 0.15s ease'
        }}
      >
        <FileText size={14} />
        <span>Info</span>
      </button>

      {showModal && (
        <Modal title={`Trade Insight & Technical Rationale: ${ticker}`} onClose={() => setShowModal(false)}>
          <div style={{ padding: '8px 4px' }}>
            <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                💡 Technical Analysis & Setup Rationale
              </span>
              <p style={{ color: '#f8fafc', fontSize: '0.98rem', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                {str}
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Close</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ apiBase, setActive, onSelectTicker }) {
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortKey, setSortKey] = useState('rank')
  const [sortAsc, setSortAsc] = useState(true)
  const [detailTicker, setDetailTicker] = useState(null)
  const [visualizerTicker, setVisualizerTicker] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError('')
    api.get(`${apiBase}/top-trades`)
      .then(d => {
        if (Array.isArray(d)) {
          setTrades(d)
        } else {
          setTrades([])
        }
        setLoading(false)
      })
      .catch(err => {
        setError(err.message || 'Failed to load top trades.')
        setLoading(false)
      })
  }, [apiBase])

  const sortedTrades = useMemo(() => {
    if (!trades.length) return []
    const list = [...trades]
    list.sort((a, b) => {
      let valA = a[sortKey] ?? ''
      let valB = b[sortKey] ?? ''
      if (typeof valA === 'number' && typeof valB === 'number') {
        return (valA - valB) * (sortAsc ? 1 : -1)
      }
      return String(valA).localeCompare(String(valB), undefined, { numeric: true }) * (sortAsc ? 1 : -1)
    })
    return list
  }, [trades, sortKey, sortAsc])

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  return (
    <div className="top-trades-dashboard">
      <section className="panel data-panel">
        <div className="table-wrap">
          <table className="top-trades-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('rank')} style={{ cursor: 'pointer', width: 60 }}>Rank</th>
                <th onClick={() => handleSort('ticker')} style={{ cursor: 'pointer' }}>Ticker / Company</th>
                <th>Detail / Chart</th>
                <th onClick={() => handleSort('setup_signal')} style={{ cursor: 'pointer' }}>Setup Signal</th>
                <th onClick={() => handleSort('sector')} style={{ cursor: 'pointer' }}>Sector</th>
                <th onClick={() => handleSort('current_price')} style={{ cursor: 'pointer' }}>CMP</th>
                <th onClick={() => handleSort('best_buy_zone')} style={{ cursor: 'pointer' }}>Best Buy Zone</th>
                <th onClick={() => handleSort('stop_loss')} style={{ cursor: 'pointer' }}>Stop Loss (SL)</th>
                <th onClick={() => handleSort('target_price')} style={{ cursor: 'pointer' }}>Target (T1 / T2)</th>
                <th onClick={() => handleSort('risk_reward')} style={{ cursor: 'pointer' }}>Risk : Reward</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10}><div className="state">Analyzing market intelligence & generating top 15 trades…</div></td></tr>}
              {error && <tr><td colSpan={10}><div className="state error">{error}</div></td></tr>}
              {!loading && !error && sortedTrades.map(t => (
                <tr key={t.ticker} className="data-row">
                  <td style={{ fontWeight: 700, color: '#7ec8f0' }}>#{t.rank}</td>
                  <td>
                    <div>
                      <b
                        onClick={(e) => { e.stopPropagation(); if (onSelectTicker) onSelectTicker(t.ticker) }}
                        style={{ color: '#38bdf8', fontSize: 14, fontFamily: "'DM Mono'", cursor: 'pointer', textDecoration: 'underline' }}
                        title={`Click to lookup ${t.ticker} in Ticker Master Data`}
                      >
                        {t.ticker}
                      </b>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.stock_name}</div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDetailTicker(t.ticker)
                        }}
                        title={`View Interactive Detail Report for ${t.ticker}`}
                        style={{
                          background: 'rgba(56, 189, 248, 0.12)',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          color: '#38bdf8',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          transition: 'all .15s ease',
                        }}
                      >
                        <FileText size={11} />
                        <span>Detail</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setVisualizerTicker(t.ticker)
                        }}
                        title={`View Interactive Candlestick Chart for ${t.ticker}`}
                        style={{
                          background: 'rgba(168, 85, 247, 0.12)',
                          border: '1px solid rgba(168, 85, 247, 0.3)',
                          color: '#c084fc',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          transition: 'all .15s ease',
                        }}
                      >
                        <TrendingUp size={11} />
                        <span>Chart</span>
                      </button>
                    </div>
                  </td>
                  <td><span className="badge buy" style={{ fontSize: '0.95rem', fontWeight: 700 }}>{t.setup_signal}</span></td>
                  <td><span style={{ fontSize: '0.95rem', color: '#cbd5e1' }}>{t.sector}</span></td>
                  <td><b style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>{t.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b></td>
                  <td>
                    <span style={{ background: 'rgba(82, 196, 26, 0.15)', color: '#52c41a', padding: '4px 10px', borderRadius: 4, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '1.15rem', fontWeight: 800 }}>
                      {t.best_buy_zone}
                    </span>
                  </td>
                  <td>
                    <span style={{ background: 'rgba(255, 77, 79, 0.15)', color: '#ff4d4f', padding: '4px 10px', borderRadius: 4, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '1.15rem', fontWeight: 800 }}>
                      {t.stop_loss.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td>
                    <div>
                      <b style={{ color: '#34d399', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '1.15rem', fontWeight: 800 }}>{t.target_price.toLocaleString('en-IN')}</b>
                      {t.target_price2 && <span style={{ fontSize: '0.92rem', color: '#94a3b8', marginLeft: 4 }}>(T2: {t.target_price2.toLocaleString('en-IN')})</span>}
                    </div>
                  </td>
                  <td><span className="status-badge buy" style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: '1.05rem', fontWeight: 700 }}>{t.risk_reward}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {detailTicker && <ReportDetailModal ticker={detailTicker} onClose={() => setDetailTicker(null)} />}
      {visualizerTicker && <StockVisualizerModal ticker={visualizerTicker} onClose={() => setVisualizerTicker(null)} />}
    </div>
  )
}

// ─── MidCap Dashboard ─────────────────────────────────────────────────────────
function MidCapDashboard({ apiBase, setActive, onSelectTicker }) {
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortKey, setSortKey] = useState('rank')
  const [sortAsc, setSortAsc] = useState(true)
  const [detailTicker, setDetailTicker] = useState(null)
  const [visualizerTicker, setVisualizerTicker] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError('')
    api.get(`${apiBase}/top-midcap-trades`)
      .then(d => {
        if (Array.isArray(d)) {
          setTrades(d)
        } else {
          setTrades([])
        }
        setLoading(false)
      })
      .catch(err => {
        setError(err.message || 'Failed to load mid-cap trades.')
        setLoading(false)
      })
  }, [apiBase])

  const sortedTrades = useMemo(() => {
    if (!trades.length) return []
    const list = [...trades]
    list.sort((a, b) => {
      let valA = a[sortKey] ?? ''
      let valB = b[sortKey] ?? ''
      if (typeof valA === 'number' && typeof valB === 'number') {
        return (valA - valB) * (sortAsc ? 1 : -1)
      }
      return String(valA).localeCompare(String(valB), undefined, { numeric: true }) * (sortAsc ? 1 : -1)
    })
    return list
  }, [trades, sortKey, sortAsc])

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  return (
    <div className="top-trades-dashboard">
      <section className="panel data-panel">
        <div className="table-wrap">
          <table className="top-trades-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('rank')} style={{ cursor: 'pointer', width: 60 }}>Rank</th>
                <th onClick={() => handleSort('ticker')} style={{ cursor: 'pointer' }}>Ticker / Company</th>
                <th>Detail / Chart</th>
                <th onClick={() => handleSort('setup_signal')} style={{ cursor: 'pointer' }}>Setup Signal</th>
                <th onClick={() => handleSort('sector')} style={{ cursor: 'pointer' }}>Sector</th>
                <th onClick={() => handleSort('current_price')} style={{ cursor: 'pointer' }}>CMP</th>
                <th onClick={() => handleSort('best_buy_zone')} style={{ cursor: 'pointer' }}>Best Buy Zone</th>
                <th onClick={() => handleSort('stop_loss')} style={{ cursor: 'pointer' }}>Stop Loss (SL)</th>
                <th onClick={() => handleSort('target_price')} style={{ cursor: 'pointer' }}>Target (T1 / T2)</th>
                <th onClick={() => handleSort('risk_reward')} style={{ cursor: 'pointer' }}>Risk : Reward</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10}><div className="state">Scanning mid-cap universe &amp; generating top 15 opportunities…</div></td></tr>}
              {error && <tr><td colSpan={10}><div className="state error">{error}</div></td></tr>}
              {!loading && !error && sortedTrades.map(t => (
                <tr key={t.ticker} className="data-row">
                  <td style={{ fontWeight: 700, color: '#fbbf24' }}>#{t.rank}</td>
                  <td>
                    <div>
                      <b
                        onClick={(e) => { e.stopPropagation(); if (onSelectTicker) onSelectTicker(t.ticker) }}
                        style={{ color: '#38bdf8', fontSize: 14, fontFamily: "'DM Mono'", cursor: 'pointer', textDecoration: 'underline' }}
                        title={`Click to lookup ${t.ticker} in Ticker Master Data`}
                      >
                        {t.ticker}
                      </b>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.stock_name}</div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setDetailTicker(t.ticker)
                        }}
                        title={`View Interactive Detail Report for ${t.ticker}`}
                        style={{
                          background: 'rgba(56, 189, 248, 0.12)',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          color: '#38bdf8',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          transition: 'all .15s ease',
                        }}
                      >
                        <FileText size={11} />
                        <span>Detail</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setVisualizerTicker(t.ticker)
                        }}
                        title={`View Interactive Candlestick Chart for ${t.ticker}`}
                        style={{
                          background: 'rgba(245, 158, 11, 0.12)',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          color: '#fbbf24',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          transition: 'all .15s ease',
                        }}
                      >
                        <TrendingUp size={11} />
                        <span>Chart</span>
                      </button>
                    </div>
                  </td>
                  <td><span className="badge buy" style={{ fontSize: '0.95rem', fontWeight: 700 }}>{t.setup_signal}</span></td>
                  <td><span style={{ fontSize: '0.95rem', color: '#cbd5e1' }}>{t.sector}</span></td>
                  <td><b style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>{t.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b></td>
                  <td>
                    <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', padding: '4px 10px', borderRadius: 4, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '1.15rem', fontWeight: 800 }}>
                      {t.best_buy_zone}
                    </span>
                  </td>
                  <td>
                    <span style={{ background: 'rgba(255, 77, 79, 0.15)', color: '#ff4d4f', padding: '4px 10px', borderRadius: 4, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '1.15rem', fontWeight: 800 }}>
                      {t.stop_loss}
                    </span>
                  </td>
                  <td>
                    <div>
                      <b style={{ color: '#34d399', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '1.15rem', fontWeight: 800 }}>{t.target_price}</b>
                    </div>
                  </td>
                  <td><span className="status-badge buy" style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: '1.05rem', fontWeight: 700 }}>{t.risk_reward}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {detailTicker && <ReportDetailModal ticker={detailTicker} onClose={() => setDetailTicker(null)} />}
      {visualizerTicker && <StockVisualizerModal ticker={visualizerTicker} onClose={() => setVisualizerTicker(null)} />}
    </div>
  )
}

// ─── SmallCap Dashboard ───────────────────────────────────────────────────────
function SmallCapDashboard({ apiBase, setActive, onSelectTicker }) {
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortKey, setSortKey] = useState('rank')
  const [sortAsc, setSortAsc] = useState(true)
  const [detailTicker, setDetailTicker] = useState(null)
  const [visualizerTicker, setVisualizerTicker] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError('')
    api.get(`${apiBase}/top-smallcap-trades`)
      .then(d => { setTrades(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(err => { setError(err.message || 'Failed to load small-cap trades.'); setLoading(false) })
  }, [apiBase])

  const sortedTrades = useMemo(() => {
    if (!trades.length) return []
    const list = [...trades]
    list.sort((a, b) => {
      let valA = a[sortKey] ?? '', valB = b[sortKey] ?? ''
      if (typeof valA === 'number' && typeof valB === 'number') return (valA - valB) * (sortAsc ? 1 : -1)
      return String(valA).localeCompare(String(valB), undefined, { numeric: true }) * (sortAsc ? 1 : -1)
    })
    return list
  }, [trades, sortKey, sortAsc])

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  return (
    <div className="top-trades-dashboard">
      <section className="panel data-panel">
        <div className="table-wrap">
          <table className="top-trades-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('rank')} style={{ cursor: 'pointer', width: 60 }}>Rank</th>
                <th onClick={() => handleSort('ticker')} style={{ cursor: 'pointer' }}>Ticker / Company</th>
                <th>Detail / Chart</th>
                <th onClick={() => handleSort('setup_signal')} style={{ cursor: 'pointer' }}>Setup Signal</th>
                <th onClick={() => handleSort('sector')} style={{ cursor: 'pointer' }}>Sector</th>
                <th onClick={() => handleSort('current_price')} style={{ cursor: 'pointer' }}>CMP</th>
                <th onClick={() => handleSort('best_buy_zone')} style={{ cursor: 'pointer' }}>Best Buy Zone</th>
                <th onClick={() => handleSort('stop_loss')} style={{ cursor: 'pointer' }}>Stop Loss (SL)</th>
                <th onClick={() => handleSort('target_price')} style={{ cursor: 'pointer' }}>Target (T1 / T2)</th>
                <th onClick={() => handleSort('risk_reward')} style={{ cursor: 'pointer' }}>Risk : Reward</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10}><div className="state">Scanning small-cap universe &amp; generating top 15 opportunities…</div></td></tr>}
              {error && <tr><td colSpan={10}><div className="state error">{error}</div></td></tr>}
              {!loading && !error && sortedTrades.map(t => (
                <tr key={t.ticker} className="data-row">
                  <td style={{ fontWeight: 700, color: '#a78bfa' }}>#{t.rank}</td>
                  <td>
                    <div>
                      <b
                        onClick={(e) => { e.stopPropagation(); if (onSelectTicker) onSelectTicker(t.ticker) }}
                        style={{ color: '#38bdf8', fontSize: 14, fontFamily: "'DM Mono'", cursor: 'pointer', textDecoration: 'underline' }}
                        title={`Click to lookup ${t.ticker} in Ticker Master Data`}
                      >
                        {t.ticker}
                      </b>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.stock_name}</div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setDetailTicker(t.ticker) }}
                        title={`View Interactive Detail Report for ${t.ticker}`}
                        style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)', color: '#38bdf8', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600, transition: 'all .15s ease' }}>
                        <FileText size={11} /><span>Detail</span>
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setVisualizerTicker(t.ticker) }}
                        title={`View Interactive Candlestick Chart for ${t.ticker}`}
                        style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', color: '#a78bfa', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600, transition: 'all .15s ease' }}>
                        <TrendingUp size={11} /><span>Chart</span>
                      </button>
                    </div>
                  </td>
                  <td><span className="badge buy" style={{ fontSize: '0.95rem', fontWeight: 700 }}>{t.setup_signal}</span></td>
                  <td><span style={{ fontSize: '0.95rem', color: '#cbd5e1' }}>{t.sector}</span></td>
                  <td><b style={{ fontMinimal: '1.25rem', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>{t.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b></td>
                  <td><span style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', padding: '4px 10px', borderRadius: 4, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '1.15rem', fontWeight: 800 }}>{t.best_buy_zone}</span></td>
                  <td><span style={{ background: 'rgba(255,77,79,0.15)', color: '#ff4d4f', padding: '4px 10px', borderRadius: 4, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '1.15rem', fontWeight: 800 }}>{t.stop_loss}</span></td>
                  <td><b style={{ color: '#34d399', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '1.15rem', fontWeight: 800 }}>{t.target_price}</b></td>
                  <td><span className="status-badge buy" style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: '1.05rem', fontWeight: 700 }}>{t.risk_reward}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {detailTicker && <ReportDetailModal ticker={detailTicker} onClose={() => setDetailTicker(null)} />}
      {visualizerTicker && <StockVisualizerModal ticker={visualizerTicker} onClose={() => setVisualizerTicker(null)} />}
    </div>
  )
}

// ─── LargeCap Dashboard ───────────────────────────────────────────────────────
function LargeCapDashboard({ apiBase, setActive, onSelectTicker }) {
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortKey, setSortKey] = useState('rank')
  const [sortAsc, setSortAsc] = useState(true)
  const [detailTicker, setDetailTicker] = useState(null)
  const [visualizerTicker, setVisualizerTicker] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError('')
    api.get(`${apiBase}/top-largecap-trades`)
      .then(d => { setTrades(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(err => { setError(err.message || 'Failed to load large-cap trades.'); setLoading(false) })
  }, [apiBase])

  const sortedTrades = useMemo(() => {
    if (!trades.length) return []
    const list = [...trades]
    list.sort((a, b) => {
      let valA = a[sortKey] ?? '', valB = b[sortKey] ?? ''
      if (typeof valA === 'number' && typeof valB === 'number') return (valA - valB) * (sortAsc ? 1 : -1)
      return String(valA).localeCompare(String(valB), undefined, { numeric: true }) * (sortAsc ? 1 : -1)
    })
    return list
  }, [trades, sortKey, sortAsc])

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  return (
    <div className="top-trades-dashboard">
      <section className="panel data-panel">
        <div className="table-wrap">
          <table className="top-trades-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('rank')} style={{ cursor: 'pointer', width: 60 }}>Rank</th>
                <th onClick={() => handleSort('ticker')} style={{ cursor: 'pointer' }}>Ticker / Company</th>
                <th>Detail / Chart</th>
                <th onClick={() => handleSort('setup_signal')} style={{ cursor: 'pointer' }}>Setup Signal</th>
                <th onClick={() => handleSort('sector')} style={{ cursor: 'pointer' }}>Sector</th>
                <th onClick={() => handleSort('current_price')} style={{ cursor: 'pointer' }}>CMP</th>
                <th onClick={() => handleSort('best_buy_zone')} style={{ cursor: 'pointer' }}>Best Buy Zone</th>
                <th onClick={() => handleSort('stop_loss')} style={{ cursor: 'pointer' }}>Stop Loss (SL)</th>
                <th onClick={() => handleSort('target_price')} style={{ cursor: 'pointer' }}>Target (T1 / T2)</th>
                <th onClick={() => handleSort('risk_reward')} style={{ cursor: 'pointer' }}>Risk : Reward</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10}><div className="state">Scanning large-cap universe &amp; generating top 15 opportunities…</div></td></tr>}
              {error && <tr><td colSpan={10}><div className="state error">{error}</div></td></tr>}
              {!loading && !error && sortedTrades.map(t => (
                <tr key={t.ticker} className="data-row">
                  <td style={{ fontWeight: 700, color: '#22d3ee' }}>#{t.rank}</td>
                  <td>
                    <div>
                      <b
                        onClick={(e) => { e.stopPropagation(); if (onSelectTicker) onSelectTicker(t.ticker) }}
                        style={{ color: '#38bdf8', fontSize: 14, fontFamily: "'DM Mono'", cursor: 'pointer', textDecoration: 'underline' }}
                        title={`Click to lookup ${t.ticker} in Ticker Master Data`}
                      >
                        {t.ticker}
                      </b>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.stock_name}</div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setDetailTicker(t.ticker) }}
                        title={`View Interactive Detail Report for ${t.ticker}`}
                        style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)', color: '#38bdf8', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600, transition: 'all .15s ease' }}>
                        <FileText size={11} /><span>Detail</span>
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setVisualizerTicker(t.ticker) }}
                        title={`View Interactive Candlestick Chart for ${t.ticker}`}
                        style={{ background: 'rgba(34,211,238,0.12)', border: '1px solid rgba(34,211,238,0.3)', color: '#22d3ee', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600, transition: 'all .15s ease' }}>
                        <TrendingUp size={11} /><span>Chart</span>
                      </button>
                    </div>
                  </td>
                  <td><span className="badge buy" style={{ fontSize: '0.95rem', fontWeight: 700 }}>{t.setup_signal}</span></td>
                  <td><span style={{ fontSize: '0.95rem', color: '#cbd5e1' }}>{t.sector}</span></td>
                  <td><b style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>{t.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b></td>
                  <td><span style={{ background: 'rgba(34,211,238,0.15)', color: '#22d3ee', padding: '4px 10px', borderRadius: 4, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '1.15rem', fontWeight: 800 }}>{t.best_buy_zone}</span></td>
                  <td><span style={{ background: 'rgba(255,77,79,0.15)', color: '#ff4d4f', padding: '4px 10px', borderRadius: 4, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '1.15rem', fontWeight: 800 }}>{t.stop_loss}</span></td>
                  <td><b style={{ color: '#34d399', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '1.15rem', fontWeight: 800 }}>{t.target_price}</b></td>
                  <td><span className="status-badge buy" style={{ fontFamily: "'Inter', system-ui, sans-serif", fontSize: '1.05rem', fontWeight: 700 }}>{t.risk_reward}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {detailTicker && <ReportDetailModal ticker={detailTicker} onClose={() => setDetailTicker(null)} />}
      {visualizerTicker && <StockVisualizerModal ticker={visualizerTicker} onClose={() => setVisualizerTicker(null)} />}
    </div>
  )
}

// ─── Penny Stocks (Micro/Small-Cap MF Backed) Dashboard ─────────────────────
function PennyStocksDashboard({ apiBase, setActive, onSelectTicker }) {
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortKey, setSortKey] = useState('rank')
  const [sortAsc, setSortAsc] = useState(true)
  const [detailTicker, setDetailTicker] = useState(null)
  const [visualizerTicker, setVisualizerTicker] = useState(null)

  // Filter state & pagination state
  const [capFilter, setCapFilter] = useState('ALL')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    let isMounted = true
    setLoading(true)
    fetch(`${apiBase}/top-penny-trades`)
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        if (isMounted) {
          setTrades(Array.isArray(d) ? d : [])
          setLoading(false)
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err.message)
          setLoading(false)
        }
      })
    return () => { isMounted = false }
  }, [apiBase])

  // Truncate cell text > 20 chars per user rule
  const renderTruncated = (text) => {
    if (!text) return '—'
    const str = String(text)
    if (str.length > 20) return str.slice(0, 16) + '...'
    return str
  }

  const filteredTrades = useMemo(() => {
    let list = [...trades]
    if (capFilter !== 'ALL') {
      const target = capFilter.toUpperCase().trim()
      list = list.filter(t => {
        const c = (t.market_cap_category || '').toUpperCase().trim()
        if (target.includes('NANO')) return c.includes('NANO')
        if (target.includes('MICRO')) return c.includes('MICRO')
        if (target.includes('SMALL')) return c.includes('SMALL')
        if (target.includes('SME')) return c.includes('SME')
        return c === target
      })
    }
    if (sortKey) {
      list.sort((a, b) => {
        let valA = a[sortKey] ?? '', valB = b[sortKey] ?? ''
        if (typeof valA === 'number' && typeof valB === 'number') return (valA - valB) * (sortAsc ? 1 : -1)
        return String(valA).localeCompare(String(valB), undefined, { numeric: true }) * (sortAsc ? 1 : -1)
      })
    }
    return list
  }, [trades, capFilter, sortKey, sortAsc])

  // Reset page when filter or page size changes
  useEffect(() => {
    setPage(1)
  }, [capFilter, pageSize])

  const paginatedTrades = useMemo(() => {
    if (pageSize === 'ALL') return filteredTrades
    const sz = Number(pageSize) || 10
    const start = (page - 1) * sz
    return filteredTrades.slice(start, start + sz)
  }, [filteredTrades, page, pageSize])

  const totalPages = pageSize === 'ALL' ? 1 : Math.ceil(filteredTrades.length / (Number(pageSize) || 10)) || 1

  const handleSort = (key) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  const countForCap = (cat) => trades.filter(t => {
    const c = (t.market_cap_category || '').toUpperCase().trim()
    const target = cat.toUpperCase().trim()
    if (target.includes('NANO')) return c.includes('NANO')
    if (target.includes('MICRO')) return c.includes('MICRO')
    if (target.includes('SMALL')) return c.includes('SMALL')
    if (target.includes('SME')) return c.includes('SME')
    return c === target
  }).length

  return (
    <div className="top-trades-dashboard">
      <section className="panel data-panel">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(234, 179, 8, 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, color: '#facc15', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
              ⚡ Penny Stocks & Institutional Micro-Cap Opportunities
            </h3>
            <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
              Showing Small-Cap &amp; Micro-Cap tickers backed by a minimum of 2 Mutual Funds holding &gt; 2% stake each.
            </div>
          </div>

          {/* Interactive Market Cap Filter Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: 0.5 }}>FILTER CAP:</span>
            <button
              onClick={() => setCapFilter('ALL')}
              style={{
                background: capFilter === 'ALL' ? '#38bdf8' : 'rgba(255,255,255,0.05)',
                color: capFilter === 'ALL' ? '#0f172a' : '#cbd5e1',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer'
              }}
            >
              All Caps ({trades.length})
            </button>
            <button
              onClick={() => setCapFilter('Nano Cap')}
              style={{
                background: capFilter === 'Nano Cap' ? '#a855f7' : 'rgba(168, 85, 247, 0.12)',
                color: capFilter === 'Nano Cap' ? '#ffffff' : '#c084fc',
                border: '1px solid rgba(168, 85, 247, 0.4)',
                borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer'
              }}
            >
              🟣 Nano Cap ({countForCap('Nano Cap')})
            </button>
            <button
              onClick={() => setCapFilter('Micro Cap')}
              style={{
                background: capFilter === 'Micro Cap' ? '#ec4899' : 'rgba(236, 72, 153, 0.12)',
                color: capFilter === 'Micro Cap' ? '#ffffff' : '#f472b6',
                border: '1px solid rgba(236, 72, 153, 0.4)',
                borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer'
              }}
            >
              🟢 Micro Cap ({countForCap('Micro Cap')})
            </button>
            <button
              onClick={() => setCapFilter('Small Cap')}
              style={{
                background: capFilter === 'Small Cap' ? '#f97316' : 'rgba(249, 115, 22, 0.12)',
                color: capFilter === 'Small Cap' ? '#ffffff' : '#fb923c',
                border: '1px solid rgba(249, 115, 22, 0.4)',
                borderRadius: 6, padding: '4px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer'
              }}
            >
              🔵 Small Cap ({countForCap('Small Cap')})
            </button>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="top-trades-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('rank')} style={{ cursor: 'pointer', width: 60 }}>Rank</th>
                <th onClick={() => handleSort('ticker')} style={{ cursor: 'pointer' }}>Ticker / Company / Market Cap</th>
                <th>Detail / Chart</th>
                <th onClick={() => handleSort('setup_signal')} style={{ cursor: 'pointer' }}>Setup Signal</th>
                <th onClick={() => handleSort('sector')} style={{ cursor: 'pointer' }}>Sector</th>
                <th onClick={() => handleSort('current_price')} style={{ cursor: 'pointer' }}>CMP</th>
                <th onClick={() => handleSort('fund_count')} style={{ cursor: 'pointer' }}>MFs &gt;2%</th>
                <th onClick={() => handleSort('best_buy_zone')} style={{ cursor: 'pointer' }}>Best Buy Zone</th>
                <th onClick={() => handleSort('stop_loss')} style={{ cursor: 'pointer' }}>Stop Loss (SL)</th>
                <th onClick={() => handleSort('target_price')} style={{ cursor: 'pointer' }}>Target (T1 / T2)</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10}><div className="state" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><RefreshCw size={16} className="spin" style={{ color: '#facc15' }} /> Loading microcap &amp; smallcap institutional picks…</div></td></tr>}
              {error && <tr><td colSpan={10}><div className="state error">{error}</div></td></tr>}
              {!loading && !error && paginatedTrades.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: 14 }}>
                    No tickers matching the selected Market Cap filter ({capFilter}).
                  </td>
                </tr>
              )}
              {!loading && !error && paginatedTrades.map(t => (
                <tr key={t.ticker} className="data-row">
                  <td style={{ fontWeight: 700, color: '#facc15' }}>#{t.rank}</td>
                  <td>
                    <div>
                      <b
                        onClick={(e) => { e.stopPropagation(); if (onSelectTicker) onSelectTicker(t.ticker) }}
                        style={{ color: '#38bdf8', fontSize: 14, fontFamily: "'DM Mono'", cursor: 'pointer', textDecoration: 'underline' }}
                        title={`Click to lookup ${t.ticker} in Ticker Master Data`}
                      >
                        {t.ticker}
                      </b>
                      <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                        <span>{renderTruncated(t.stock_name)}</span>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: String(t.market_cap_category).toUpperCase().includes('NANO')
                            ? 'rgba(168, 85, 247, 0.18)'
                            : String(t.market_cap_category).toUpperCase().includes('MICRO')
                            ? 'rgba(236, 72, 153, 0.18)'
                            : String(t.market_cap_category).toUpperCase().includes('SMALL')
                            ? 'rgba(249, 115, 22, 0.18)'
                            : 'rgba(6, 182, 212, 0.18)',
                          color: String(t.market_cap_category).toUpperCase().includes('NANO')
                            ? '#c084fc'
                            : String(t.market_cap_category).toUpperCase().includes('MICRO')
                            ? '#ec4899'
                            : String(t.market_cap_category).toUpperCase().includes('SMALL')
                            ? '#f97316'
                            : '#22d3ee',
                          border: `1px solid ${
                            String(t.market_cap_category).toUpperCase().includes('NANO')
                              ? 'rgba(168, 85, 247, 0.4)'
                              : String(t.market_cap_category).toUpperCase().includes('MICRO')
                              ? 'rgba(236, 72, 153, 0.4)'
                              : String(t.market_cap_category).toUpperCase().includes('SMALL')
                              ? 'rgba(249, 115, 22, 0.4)'
                              : 'rgba(6, 182, 212, 0.4)'
                          }`
                        }}>
                          {(t.market_cap_category || 'MICRO CAP').toUpperCase()}
                          {t.market_cap_cr > 0 ? ` (${t.market_cap_cr >= 1000 ? `₹${(t.market_cap_cr / 1000).toFixed(1)}k Cr` : `₹${Number(t.market_cap_cr).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`})` : ''}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setDetailTicker(t.ticker) }}
                        title={`View Interactive Detail Report for ${t.ticker}`}
                        style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)', color: '#38bdf8', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600, transition: 'all .15s ease' }}>
                        <FileText size={11} /><span>Detail</span>
                      </button>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setVisualizerTicker(t.ticker) }}
                        title={`View Interactive Candlestick Chart for ${t.ticker}`}
                        style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)', color: '#facc15', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600, transition: 'all .15s ease' }}>
                        <TrendingUp size={11} /><span>Chart</span>
                      </button>
                    </div>
                  </td>
                  <td><span className="badge buy" style={{ fontSize: '0.95rem', fontWeight: 700 }}>{t.setup_signal}</span></td>
                  <td><span style={{ fontSize: '0.95rem', color: '#cbd5e1' }}>{renderTruncated(t.sector)}</span></td>
                  <td><b style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>₹{t.current_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b></td>
                  <td>
                    <span style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', padding: '3px 8px', borderRadius: 4, fontWeight: 800, fontFamily: "'DM Mono', monospace" }}>
                      {t.fund_count} MFs
                    </span>
                  </td>
                  <td><span style={{ background: 'rgba(234,179,8,0.15)', color: '#facc15', padding: '4px 10px', borderRadius: 4, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '1.15rem', fontWeight: 800 }}>{t.best_buy_zone}</span></td>
                  <td><span style={{ background: 'rgba(255,77,79,0.15)', color: '#ff4d4f', padding: '4px 10px', borderRadius: 4, fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '1.15rem', fontWeight: 800 }}>{t.stop_loss}</span></td>
                  <td><b style={{ color: '#34d399', fontFamily: "'Inter', system-ui, -apple-system, sans-serif", fontSize: '1.15rem', fontWeight: 800 }}>{t.target_price}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Client-side Pagination Controls */}
        {!loading && !error && filteredTrades.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'rgba(0,0,0,0.3)', borderTop: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Showing {filteredTrades.length > 0 ? (page - 1) * (pageSize === 'ALL' ? filteredTrades.length : Number(pageSize)) + 1 : 0} to {pageSize === 'ALL' ? filteredTrades.length : Math.min(page * Number(pageSize), filteredTrades.length)} of {filteredTrades.length} entries
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1' }}>
                <span>Page Size:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value)}
                  style={{ background: '#0f172a', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, padding: '2px 6px', fontSize: 12 }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value="ALL">All</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(prev => Math.max(1, prev - 1))}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}
                >
                  ◄ Prev
                </button>
                <span style={{ fontSize: 12, color: '#facc15', fontWeight: 700 }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.5 : 1 }}
                >
                  Next ►
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
      {detailTicker && <ReportDetailModal ticker={detailTicker} onClose={() => setDetailTicker(null)} />}
      {visualizerTicker && <StockVisualizerModal ticker={visualizerTicker} onClose={() => setVisualizerTicker(null)} />}
    </div>
  )
}

// Helper to identify internal timestamp / audit date fields to omit from display
const isInternalTimestamp = key =>
  /timestamp|run_time|runtime|created_at|updated_at|analysed_at|fetched_date|review_date/i.test(key)

// Helper to reorder table columns: Ticker -> Signal/Call -> Record Id -> remaining cols,
// positioning fundamental score immediately after AVG PAT / PAT column.
const reorderColumns = (cols) => {
  const tickerCol = cols.find(c => c === 'ticker' || c === 'symbol')
  const signalCol = cols.find(c => /signal|call|recommended_call|status|phase/i.test(c) && c !== 'record_id')
  const dateCol = cols.find(c => c === 'record_id')

  const ordered = []
  if (tickerCol) ordered.push(tickerCol)
  if (signalCol) ordered.push(signalCol)
  if (dateCol) ordered.push(dateCol)

  cols.forEach(c => {
    if (!ordered.includes(c)) ordered.push(c)
  })

  // Move fundamental score right after AVG PAT column if both exist
  const patIndex = ordered.findIndex(c => /^pat$|avg_pat|pat_/i.test(c))
  const scoreIndex = ordered.findIndex(c => /^score$|fundamental_score|scorecard/i.test(c) && c !== 'record_id')

  if (patIndex !== -1 && scoreIndex !== -1 && patIndex !== scoreIndex) {
    const scoreCol = ordered[scoreIndex]
    ordered.splice(scoreIndex, 1)
    const newPatIndex = ordered.findIndex(c => /^pat$|avg_pat|pat_/i.test(c))
    ordered.splice(newPatIndex + 1, 0, scoreCol)
  }

  return ordered
}

// ─── Interactive Report Detail Modal with Iframe & Live Chart ─────────────────
function ReportDetailModal({ ticker, onClose, dataset }) {
  if (!ticker) return null
  const [activeTab, setActiveTab] = useState('report')

  const reportUrl = `/api/reports/html/${ticker}${dataset ? `?dataset=${encodeURIComponent(dataset)}` : ''}`

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
          height: '92vh',
          backgroundColor: '#090d16',
          borderRadius: 14,
          border: '1px solid rgba(56, 189, 248, 0.3)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85)',
          overflow: 'hidden',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            backgroundColor: '#0f172a',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: 'rgba(56, 189, 248, 0.15)', padding: 6, borderRadius: 8, display: 'flex', alignItems: 'center' }}>
              <FileText size={18} style={{ color: '#38bdf8' }} />
            </div>
            <div>
              <span style={{ fontSize: 17, fontWeight: 700, color: '#f8fafc', fontFamily: "'DM Mono'" }}>
                {ticker}
              </span>
              <span style={{ fontSize: 13, color: '#94a3b8', marginLeft: 8 }}>
                Deep Research & Visual Analytics
              </span>
            </div>

            {/* Tab switch */}
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: 2, marginLeft: 12 }}>
              <button
                onClick={() => setActiveTab('report')}
                style={{
                  background: activeTab === 'report' ? '#38bdf8' : 'transparent',
                  color: activeTab === 'report' ? '#0f172a' : '#cbd5e1',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <FileText size={13} />
                Research Report
              </button>
              <button
                onClick={() => setActiveTab('chart')}
                style={{
                  background: activeTab === 'chart' ? '#38bdf8' : 'transparent',
                  color: activeTab === 'chart' ? '#0f172a' : '#cbd5e1',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <TrendingUp size={13} />
                Live Chart Studio
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <a
              href={reportUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                textDecoration: 'none',
                color: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid rgba(56, 189, 248, 0.3)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <ExternalLink size={13} />
              Open New Tab
            </a>
            <a
              href={`/api/reports/pdf/${ticker}`}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                textDecoration: 'none',
                color: '#94a3b8',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                padding: '5px 10px',
                borderRadius: 6,
                border: '1px solid rgba(255, 255, 255, 0.12)',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <Download size={13} />
              PDF
            </a>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: '#cbd5e1',
                cursor: 'pointer',
                display: 'inline-flex',
                padding: 6,
                borderRadius: 6,
                marginLeft: 4,
              }}
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        {activeTab === 'report' ? (
          <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%', background: '#f8fafc' }}>
            <iframe
              src={reportUrl}
              title={`${ticker} Research Report`}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            />
          </div>
        ) : (
          <div style={{ flex: 1, padding: 16, overflowY: 'auto', backgroundColor: '#090d16' }}>
            <ChartErrorBoundary>
              <StockChartVisualizer ticker={ticker} height={520} />
            </ChartErrorBoundary>
          </div>
        )}
      </div>
    </div>
  )
}


// ─── Generic table view ───────────────────────────────────────────────────────
function TableView({ data, loading, error, query, setQuery, onSearch, activeTable, onSelectFnoTicker, onSelectProfileTicker, dataset, searchHistory, addSearchHistory }) {

  const [sort, setSort] = useState({ key: '', asc: true })
  const [selectedSignal, setSelectedSignal] = useState('ALL')
  const [selectedSector, setSelectedSector] = useState('ALL')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [detailTicker, setDetailTicker] = useState(null)
  const [visualizerTicker, setVisualizerTicker] = useState(null)

  const displayColumns = useMemo(() => {
    if (!data?.columns) return []
    // Keep id/run_time/uniqueid for transformation into "record_id"
    let cols = data.columns.filter(col => {
      if (col === 'id' || col === 'run_time' || col.toLowerCase() === 'uniqueid') return true
      if (col === 'reasons') return false  // excluded globally — info available on Lookup page
      return !isInternalTimestamp(col)
    })

    if (activeTable === 'historical_calls') {
      // Remove duplicate 'status' column when 'call_status' or 'outcome' is present
      if (cols.includes('call_status') || cols.includes('outcome')) {
        cols = cols.filter(col => col !== 'status')
      }
    }

    // Map id, run_time, or uniqueid to "record_id"
    cols = cols.map(c => (c === 'id' || c === 'run_time' || c.toLowerCase() === 'uniqueid') ? 'record_id' : c)

    if (activeTable === 'fno_master' || activeTable === 'fno_stock_master' || activeTable === 'fno_index_master') {
      cols = cols.filter(c => c !== 'record_id' && c !== 'id' && c !== 'created_at')
    }

    // Ensure unique column names
    cols = Array.from(new Set(cols))

    return reorderColumns(cols)
  }, [data, activeTable])

  // Extract distinct sectors available in dataset
  const availableSectors = useMemo(() => {
    if (!data?.rows) return []
    const sectors = new Set()
    data.rows.forEach(r => {
      if (r.sector && typeof r.sector === 'string' && r.sector.trim()) {
        sectors.add(r.sector.trim())
      }
    })
    return Array.from(sectors).sort()
  }, [data?.rows])

  // Reset filters on table view / dataset switch
  useEffect(() => {
    setSelectedSignal('ALL')
    setSelectedSector('ALL')
    setPage(1)
  }, [data?.table, query])

  const isCashFlowTable = data?.table === 'cash_flow_summary'

  const sortBy = key => {
    const origKey = (key === 'record_id') ? (data?.columns?.includes('uniqueid') ? 'uniqueid' : data?.columns?.includes('run_time') ? 'run_time' : 'id') : key
    setSort(prev => ({
      key: origKey,
      asc: prev.key === origKey ? !prev.asc : true,
    }))
  }

  const rows = useMemo(() => {
    if (!data) return []
    let list = [...data.rows]
    if (selectedSignal && selectedSignal !== 'ALL') {
      list = list.filter(row => {
        const sigCol = displayColumns.find(c => /signal|call|recommended_call|status|phase/i.test(c) && c !== 'record_id')
        if (!sigCol) return true
        const val = String(row[sigCol] ?? '').trim().toLowerCase()
        const target = selectedSignal.toLowerCase()
        if (target === 'positive') {
          return val === 'positive' || val.includes('buy') || val.includes('bullish') || val === 'good' || val === 'better' || val === 'accumulation'
        }
        if (target === 'negative') {
          return val === 'negative' || val.includes('sell') || val.includes('bearish') || val === 'bad' || val === 'distribution'
        }
        if (target === 'mixed') {
          return val === 'mixed' || val.includes('neutral') || val.includes('hold')
        }
        return val === target || (target === 'buy' && (val === 'buy' || val === 'bullish')) || (target === 'sell' && (val === 'sell' || val === 'bearish')) || (target === 'strong buy' && val === 'strong_bullish') || (target === 'strong sell' && val === 'strong_bearish')
      })
    }
    if (selectedSector && selectedSector !== 'ALL') {
      list = list.filter(row => String(row.sector ?? '').trim().toLowerCase() === selectedSector.toLowerCase())
    }
    if (sort.key) {
      list.sort((a, b) => {
        const valA = a[sort.key] ?? ''
        const valB = b[sort.key] ?? ''
        if (typeof valA === 'number' && typeof valB === 'number') {
          return (valA - valB) * (sort.asc ? 1 : -1)
        }
        return String(valA).localeCompare(String(valB), undefined, { numeric: true }) * (sort.asc ? 1 : -1)
      })
    }
    return list
  }, [data, sort, selectedSignal, selectedSector, displayColumns])

  const pagedRows = useMemo(() => {
    if (pageSize === 0) return rows
    return rows.slice((page - 1) * pageSize, page * pageSize)
  }, [rows, page, pageSize])

  const totalPages = Math.ceil(rows.length / (pageSize || 1)) || 1

  const hasSignalCol = useMemo(() => {
    return displayColumns.some(c => /signal|call|recommended_call|status|phase/i.test(c) && c !== 'record_id')
  }, [displayColumns])

  const hasPositiveMixedSignals = useMemo(() => {
    if (isCashFlowTable) return true
    if (!data?.rows) return false
    const sigCol = displayColumns.find(c => /signal|call|recommended_call|status|phase/i.test(c) && c !== 'record_id')
    if (!sigCol) return false
    return data.rows.some(r => {
      const v = String(r[sigCol] ?? '').toUpperCase()
      return v === 'POSITIVE' || v === 'MIXED' || v === 'NEGATIVE'
    })
  }, [data?.rows, displayColumns, isCashFlowTable])

  const handleFilterClick = filterVal => {
    if (selectedSignal === filterVal) {
      setSelectedSignal('ALL')
    } else {
      setSelectedSignal(filterVal)
    }
    setPage(1)
  }

  const formatRecordIdDate = val => {
    if (!val) return '—'
    let s = String(val).trim()
    if (/^\d{12}$/.test(s) || /^\d{6}$/.test(s)) {
      const yy = s.slice(0, 2), mm = s.slice(2, 4), dd = s.slice(4, 6)
      const fullYy = yy.length === 2 ? `20${yy}` : yy
      return `${dd}/${mm}/${fullYy}`
    }
    if (/^\d{10,}$/.test(s)) {
      const d = new Date(Number(s) * (s.length === 10 ? 1000 : 1))
      if (!isNaN(d.getTime())) {
        const dd = String(d.getDate()).padStart(2, '0')
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const yyyy = String(d.getFullYear())
        return `${dd}/${mm}/${yyyy}`
      }
    }
    // Match YYYY-MM-DD or YYYY/MM/DD
    if (/^\d{4}[-/]\d{2}[-/]\d{2}/.test(s)) {
      const parts = s.split(/[-T /]/)
      if (parts.length >= 3) {
        return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`
      }
    }
    const d = new Date(s)
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0')
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const yyyy = String(d.getFullYear())
      return `${dd}/${mm}/${yyyy}`
    }
    return s
  }

  const isCallEfficiency = activeTable === 'call_efficiency'

  // Date range state for Call Efficiency filtering
  const [effDateRange, setEffDateRange] = useState('ALL') // '7D', '30D', 'ALL', 'CUSTOM'
  const [startDateInput, setStartDateInput] = useState('')
  const [endDateInput, setEndDateInput] = useState('')

  // Calculate summary metrics for call_efficiency page
  const effMetrics = useMemo(() => {
    if (!isCallEfficiency || !data?.rows) return null
    let tot = 0, p = 0, f = 0, ps = 0, pf = 0
    data.rows.forEach(r => {
      tot += Number(r.total_calls || 0)
      p += Number(r.passed || 0)
      f += Number(r.failed || 0)
      ps += Number(r.partial_success || 0)
      pf += Number(r.partial_fail || 0)
    })
    const overallRate = tot > 0 ? (((p + (ps * 0.5)) / tot) * 100).toFixed(1) : '0.0'
    return { tot, p, f, ps, pf, overallRate }
  }, [isCallEfficiency, data?.rows])

  return (
    <section className="panel data-panel">
      {isCallEfficiency && effMetrics && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(11, 25, 41, 0.98))',
          borderRadius: 12, border: '1px solid rgba(56, 189, 248, 0.25)',
          padding: 20, marginBottom: 20, boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
        }}>
          {/* Header & Date Range Filter Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                📊 Call Efficiency Statistics Table
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
                Statistical performance metric counters of algorithm recommendation outcomes over selectable timeframes.
              </p>
            </div>

            {/* Time Period Filter Preset Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#7ec8f0', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={14} /> Time Period:
              </span>
              <button
                className={`filter-btn ${effDateRange === '7D' ? 'active' : ''}`}
                onClick={() => {
                  setEffDateRange('7D')
                  const d = new Date()
                  d.setDate(d.getDate() - 7)
                  const startStr = d.toISOString().split('T')[0]
                  setStartDateInput(startStr)
                  setEndDateInput('')
                  onSearch(startStr, '')
                }}
                style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6 }}
              >
                Last 7 Days
              </button>
              <button
                className={`filter-btn ${effDateRange === '30D' ? 'active' : ''}`}
                onClick={() => {
                  setEffDateRange('30D')
                  const d = new Date()
                  d.setDate(d.getDate() - 30)
                  const startStr = d.toISOString().split('T')[0]
                  setStartDateInput(startStr)
                  setEndDateInput('')
                  onSearch(startStr, '')
                }}
                style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6 }}
              >
                Last 30 Days
              </button>
              <button
                className={`filter-btn ${effDateRange === 'ALL' ? 'active' : ''}`}
                onClick={() => {
                  setEffDateRange('ALL')
                  setStartDateInput('')
                  setEndDateInput('')
                  onSearch('', '')
                }}
                style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6 }}
              >
                All Time
              </button>

              {/* Winning Post / Share Summary Export */}
              <button
                onClick={() => {
                  const summaryText = `🎯 BSA SCREENER CALL EFFICIENCY WINNING POST 🎯\n` +
                    `----------------------------------------\n` +
                    `📈 Overall Success Rate: ${effMetrics.overallRate}%\n` +
                    `✅ Target Passed: ${effMetrics.p}\n` +
                    `❌ Stopped Out (Failed): ${effMetrics.f}\n` +
                    `⚡ Partial Success: ${effMetrics.ps}\n` +
                    `⚠️ Partial Fail: ${effMetrics.pf}\n` +
                    `📊 Total Recommendation Calls Evaluated: ${effMetrics.tot}\n` +
                    `----------------------------------------\n` +
                    `Verified by BSA Quantitative Engine`
                  navigator.clipboard.writeText(summaryText)
                  alert('🏆 Call Efficiency Statistics summary copied to clipboard as Winning Post!')
                }}
                style={{
                  background: 'linear-gradient(135deg, #059669, #10b981)',
                  color: '#fff', border: 'none', borderRadius: 6,
                  padding: '5px 12px', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  marginLeft: 6
                }}
              >
                <Share2 size={13} /> Export Winning Post
              </button>
            </div>
          </div>

          {/* Clean 2-Column Statistics Table Layout */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, alignItems: 'start' }}>
            <div style={{ background: 'rgba(0, 0, 0, 0.3)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(56, 189, 248, 0.12)', borderBottom: '1px solid rgba(56, 189, 248, 0.25)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', color: '#7ec8f0', fontWeight: 700 }}>Statistical Performance Field</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', color: '#7ec8f0', fontWeight: 700 }}>Evaluated Count Value</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px 14px', color: '#f8fafc', fontWeight: 600 }}>Total Call Recommended</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#38bdf8', fontFamily: "'DM Mono'" }}>{effMetrics.tot}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px 14px', color: '#22c55e', fontWeight: 600 }}>✅ Passed (Target Hit)</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#22c55e', fontFamily: "'DM Mono'" }}>{effMetrics.p}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px 14px', color: '#ef4444', fontWeight: 600 }}>❌ Failed (Stop Loss Hit)</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#ef4444', fontFamily: "'DM Mono'" }}>{effMetrics.f}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px 14px', color: '#eab308', fontWeight: 600 }}>⚡ Partial Success (30d Expired in Profit)</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#eab308', fontFamily: "'DM Mono'" }}>{effMetrics.ps}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '10px 14px', color: '#f97316', fontWeight: 600 }}>⚠️ Partial Fail (30d Expired in Loss)</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#f97316', fontFamily: "'DM Mono'" }}>{effMetrics.pf}</td>
                  </tr>
                  <tr style={{ background: 'rgba(56, 189, 248, 0.06)' }}>
                    <td style={{ padding: '10px 14px', color: '#38bdf8', fontWeight: 700 }}>🔥 Overall Success Rate %</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#38bdf8', fontSize: 15, fontFamily: "'DM Mono'" }}>{effMetrics.overallRate}%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Drilldown Link Box to View Full Detailed Historical Calls Breakdown */}
            <div style={{ background: 'rgba(56, 189, 248, 0.05)', padding: 18, borderRadius: 8, border: '1px solid rgba(56, 189, 248, 0.2)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                🔍 Detailed Call Logs & Entry/Exit Status
              </div>
              <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, margin: '0 0 14px 0' }}>
                View complete individual stock call records, date recommended, review date, locked entry price, target/stop-loss levels, and final outcome status.
              </p>
              <button
                onClick={() => {
                  const evt = new CustomEvent('navigate_table', { detail: 'historical_calls' })
                  window.dispatchEvent(evt)
                }}
                style={{
                  alignSelf: 'flex-start',
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  color: '#38bdf8', padding: '8px 16px', borderRadius: 6,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6
                }}
              >
                Open Detailed Historical Call Records <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1 }}>
          <div className="search">
            <Search size={17} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  if (query) addSearchHistory(query)
                  onSearch()
                }
              }}
              placeholder={dataset === 'us_intelligence' ? "Search ticker, company name, sector, signal (e.g. AAPL, NVDA)..." : "Search ticker, company name, sector, signal (e.g. RELIANCE, BEL)..."}
            />
            <button onClick={() => { if (query) addSearchHistory(query); onSearch(); }}>Search</button>
          </div>

          {searchHistory && searchHistory.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Recent Searches:</span>
              {searchHistory.map(t => (
                <button
                  key={t}
                  className={`filter-btn ${query.toUpperCase() === t ? 'active' : ''}`}
                  onClick={() => { setQuery(t); onSearch(); }}
                  style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4 }}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {availableSectors.length > 0 && (
            <div className="sector-filter-wrap" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Filter size={15} style={{ color: '#7ec8f0' }} />
              <select
                className="sector-select"
                value={selectedSector}
                onChange={e => { setSelectedSector(e.target.value); setPage(1); }}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#e1e6ed',
                  borderRadius: 6,
                  padding: '6px 12px',
                  fontSize: 13,
                  fontWeight: 500,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="ALL" style={{ background: '#1a202c', color: '#fff' }}>All Sectors ({availableSectors.length})</option>
                {availableSectors.map(sec => (
                  <option key={sec} value={sec} style={{ background: '#1a202c', color: '#fff' }}>
                    {sec}
                  </option>
                ))}
              </select>
            </div>
          )}

          {hasSignalCol && (
            <div className="filter-bar">
              <button className={`filter-btn ${selectedSignal === 'ALL' ? 'active' : ''}`} onClick={() => { setSelectedSignal('ALL'); setPage(1); }}>All</button>
              {hasPositiveMixedSignals ? (
                <>
                  <button className={`filter-btn buy ${selectedSignal === 'Positive' ? 'active' : ''}`} onClick={() => handleFilterClick('Positive')}>Positive</button>
                  <button className={`filter-btn neutral ${selectedSignal === 'Mixed' ? 'active' : ''}`} onClick={() => handleFilterClick('Mixed')}>Mixed</button>
                  <button className={`filter-btn sell ${selectedSignal === 'Negative' ? 'active' : ''}`} onClick={() => handleFilterClick('Negative')}>Negative</button>
                </>
              ) : (
                <>
                  <button className={`filter-btn strong-buy ${selectedSignal === 'Strong Buy' ? 'active' : ''}`} onClick={() => handleFilterClick('Strong Buy')}>Strong Buy</button>
                  <button className={`filter-btn buy ${selectedSignal === 'Buy' ? 'active' : ''}`} onClick={() => handleFilterClick('Buy')}>Buy</button>
                  <button className={`filter-btn neutral ${selectedSignal === 'Neutral' ? 'active' : ''}`} onClick={() => handleFilterClick('Neutral')}>Neutral</button>
                  <button className={`filter-btn sell ${selectedSignal === 'Sell' ? 'active' : ''}`} onClick={() => handleFilterClick('Sell')}>Sell</button>
                  <button className={`filter-btn strong-sell ${selectedSignal === 'Strong Sell' ? 'active' : ''}`} onClick={() => handleFilterClick('Strong Sell')}>Strong Sell</button>
                </>
              )}
            </div>
          )}

        </div>
        <span style={{ fontSize: 12, color: '#7ec8f0', fontWeight: 600 }}>
          {rows.length} records ({displayColumns.length} columns)
        </span>
      </div>

      {loading && (
        <div className="state" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '50px 20px' }}>
          <RefreshCw size={26} className="spin-icon" style={{ color: '#38bdf8' }} />
          <div style={{ fontSize: 14, color: '#94a3b8', fontWeight: 500 }}>
            Fetching and resolving live records, please wait...
          </div>
        </div>
      )}
      {error && <div className="state error">{error}</div>}
      {!loading && !error && data && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 65, textAlign: 'center', color: '#7ec8f0', background: 'rgba(126,200,240,0.1)' }}># S.No</th>
                {displayColumns.map(key => {
                  const origKey = (key === 'record_id') ? (data?.columns?.includes('uniqueid') ? 'uniqueid' : data?.columns?.includes('run_time') ? 'run_time' : 'id') : key
                  let headerLabel = key.replaceAll('_', ' ')
                  if (activeTable === 'historical_calls') {
                    if (key === 'current_price' || key === 'cmp') {
                      headerLabel = 'Call CMP'
                    } else if (key === 'call_status' || key === 'outcome') {
                      headerLabel = 'Call Status'
                    }
                  }
                  return (
                    <th key={key} onClick={() => sortBy(key)} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {headerLabel} {sort.key === origKey && (sort.asc ? '↑' : '↓')}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row, index) => {
                const fnoSymbol = row.symbol || row.ticker
                const isFnoMaster = activeTable === 'fno_master' || activeTable === 'fno_stock_master' || activeTable === 'fno_index_master'
                const rowNo = (pageSize === 0 ? 0 : (page - 1) * pageSize) + index + 1

                return (
                  <tr
                    key={index}
                    onClick={() => {
                      if (isFnoMaster && fnoSymbol && onSelectFnoTicker) {
                        onSelectFnoTicker(fnoSymbol)
                      }
                    }}
                    className={isFnoMaster ? 'clickable-fno-row' : ''}
                    style={isFnoMaster ? { cursor: 'pointer' } : {}}
                    title={isFnoMaster ? `Click to analyze Option Chain & Greeks for ${fnoSymbol}` : ''}
                  >
                    <td style={{ textAlign: 'center', color: '#7ec8f0', fontWeight: 700, fontSize: 11, fontFamily: "'DM Mono'" }}>
                      #{rowNo}
                    </td>

                    {displayColumns.map(key => {
                      const origKey = (key === 'record_id') ? (row.uniqueid ? 'uniqueid' : row.run_time ? 'run_time' : 'id') : key
                      const value = row[origKey] ?? row[key]

                      const badge = typeof value === 'string' && /signal|call|status|phase|spike|bet/.test(key) && key !== 'record_id'
                      if (key === 'ticker' || key === 'symbol') {
                        const cleanT = cleanTicker(value)
                        if (isFnoMaster) {
                          return (
                            <td key={key}>
                              <b
                                className="fno-ticker-badge"
                                style={{
                                  color: '#66e4ca',
                                  fontFamily: "'DM Mono'",
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  cursor: 'pointer',
                                }}
                              >
                                <TrendingUp size={13} />
                                {cleanT}
                              </b>
                            </td>
                          )
                        }
                        return (
                          <td key={key}>
                            <b style={{ color: '#7ec8f0', fontFamily: "'DM Mono'" }}>{cleanT}</b>
                          </td>
                        )
                      }
                      if (key === 'current_price') {
                        const isIndex = row.instrument_type === 'OPTIDX' || ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'NIFTYNXT50'].includes(row.symbol)
                        return (
                          <td key={key}>
                            <b style={{ color: '#38bdf8', fontFamily: "'DM Mono'", fontWeight: 700, background: 'rgba(56,189,248,0.1)', padding: '2px 8px', borderRadius: 4 }}>
                              {value != null ? (isIndex ? Number(value).toLocaleString() : `₹${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`) : '—'}
                            </b>
                          </td>
                        )
                      }
                      if (key === 'record_id') {
                        return <td key={key}>{formatRecordIdDate(value)}</td>
                      }
                      return <td key={key}>{badge ? <span className={`badge ${signalTone(value)}`}>{format(value, key)}</span> : format(value, key)}</td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!rows.length && <div className="state">No matching rows.</div>}

          {/* Clean Footer Pagination Controls */}
          {rows.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(15,23,42,0.6)', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                Showing <b>{pageSize === 0 ? 1 : (page - 1) * pageSize + 1}</b> to <b>{pageSize === 0 ? rows.length : Math.min(page * pageSize, rows.length)}</b> of <b>{rows.length}</b> records (Total DB: {data.total || rows.length})
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#cbd5e1' }}>
                  <span>Page Size:</span>
                  <select
                    value={pageSize}
                    onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                    style={{ background: '#1a202c', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, padding: '3px 8px', fontSize: 12, cursor: 'pointer' }}
                  >
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                    <option value={250}>250 per page</option>
                    <option value={0}>All ({rows.length})</option>
                  </select>
                </div>

                {pageSize > 0 && totalPages > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      className="filter-btn"
                      disabled={page <= 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      style={{ padding: '3px 10px', fontSize: 12, opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}
                    >
                      ◄ Prev
                    </button>
                    <span style={{ fontSize: 12, color: '#fff', fontWeight: 600, padding: '0 6px' }}>
                      Page {page} of {totalPages}
                    </span>
                    <button
                      className="filter-btn"
                      disabled={page >= totalPages}
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      style={{ padding: '3px 10px', fontSize: 12, opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}
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
      {detailTicker && <ReportDetailModal ticker={detailTicker} dataset={dataset} onClose={() => setDetailTicker(null)} />}
      {visualizerTicker && <StockVisualizerModal ticker={visualizerTicker} dataset={dataset} onClose={() => setVisualizerTicker(null)} />}
    </section>
  )
}

// ─── Sector Intelligence Page ─────────────────────────────────────────────────
const SCAN_TABLES = ['operatorfootprint', 'breakout', 'trend_trading', 'reversal_trading', 'swinger', 'support_resistance', 'quicktrade_timestamp', 'screener_timestamp']

function SectorIntelligencePage({ sectorName, data, scanTable, onScanTableChange }) {
  const [sort, setSort] = useState({ key: '', asc: true })

  if (!data) return <div className="state">Loading sector data…</div>

  const rawColumns = data.rows.length > 0 ? Object.keys(data.rows[0]) : []
  let displayCols = rawColumns.filter(col => {
    if (col === 'id' || col === 'run_time' || col.toLowerCase() === 'uniqueid') return true
    return !isInternalTimestamp(col)
  }).map(c => (c === 'id' || c === 'run_time' || c.toLowerCase() === 'uniqueid') ? 'record_id' : c)

  displayCols = Array.from(new Set(displayCols))
  const orderedCols = reorderColumns(displayCols)

  const sortBy = key => {
    const origKey = (key === 'record_id') ? (data.rows.length > 0 && 'run_time' in data.rows[0] ? 'run_time' : 'id') : key
    setSort(prev => ({
      key: origKey,
      asc: prev.key === origKey ? !prev.asc : true,
    }))
  }

  const sortedRows = (() => {
    if (!data?.rows) return []
    let list = [...data.rows]
    if (sort.key) {
      list.sort((a, b) => {
        const valA = a[sort.key] ?? ''
        const valB = b[sort.key] ?? ''
        if (typeof valA === 'number' && typeof valB === 'number') {
          return (valA - valB) * (sort.asc ? 1 : -1)
        }
        return String(valA).localeCompare(String(valB), undefined, { numeric: true }) * (sort.asc ? 1 : -1)
      })
    }
    return list
  })()

  const formatRecordIdDate = val => {
    if (!val) return '—'
    let s = String(val).trim()
    if (/^\d{12}$/.test(s) || /^\d{6}$/.test(s)) {
      const yy = s.slice(0, 2), mm = s.slice(2, 4), dd = s.slice(4, 6)
      return `${dd}-${mm}-${yy}`
    }
    if (/^\d{10,}$/.test(s)) {
      const d = new Date(Number(s) * (s.length === 10 ? 1000 : 1))
      if (!isNaN(d.getTime())) {
        return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getFullYear()).slice(-2)}`
      }
    }
    const d = new Date(s)
    if (!isNaN(d.getTime())) {
      return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getFullYear()).slice(-2)}`
    }
    return s
  }

  return (
    <div>
      <div className="master-toolbar" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="eyebrow">SCAN TABLE</span>
          <select className="select-input" value={scanTable} onChange={e => onScanTableChange(e.target.value)}>
            {SCAN_TABLES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {data.tickers.map(t => <span key={t} className="ticker-chip">{t}</span>)}
        </div>
      </div>
      {data.rows.length === 0 ? (
        <div className="state">{data.tickers.length === 0 ? 'No tickers mapped to this sector yet. Add them in Raw Data → Ticker Master.' : 'No scan data for these tickers yet.'}</div>
      ) : (
        <section className="panel data-panel">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {orderedCols.map(k => {
                    const origKey = (k === 'record_id') ? (data.rows.length > 0 && 'run_time' in data.rows[0] ? 'run_time' : 'id') : k
                    return (
                      <th key={k} onClick={() => sortBy(k)} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {k.replaceAll('_', ' ')} {sort.key === origKey && (sort.asc ? '↑' : '↓')}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, i) => (
                  <tr key={i}>
                    {orderedCols.map(k => {
                      const origKey = (k === 'record_id') ? (row.run_time ? 'run_time' : 'id') : k
                      const v = row[origKey] ?? row[k]
                      const badge = typeof v === 'string' && /signal|call|status|phase/.test(k) && k !== 'record_id'
                      if (k === 'ticker') {
                        return <td key={k}><b style={{ color: '#7ec8f0', fontFamily: "'DM Mono'" }}>{cleanTicker(v)}</b></td>
                      }
                      if (k === 'record_id') {
                        return <td key={k}>{formatRecordIdDate(v)}</td>
                      }
                      return <td key={k}>{badge ? <span className={`badge ${signalTone(v)}`}>{format(v, k)}</span> : format(v, k)}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}



createRoot(document.getElementById('root')).render(<App />)
