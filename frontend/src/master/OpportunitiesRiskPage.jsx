import React, { useEffect, useState, useMemo } from 'react'
import { Shield, Save, Search, AlertCircle, CheckCircle2, TrendingUp, AlertTriangle, Star } from 'lucide-react'
import { useToast, SectionHeader, SearchBar, Pagination, TruncatedCellText, MultiPicker } from './ui.jsx'
import * as api from './api.js'

const PAGE_SIZE = 25

export default function OpportunitiesRiskPage() {
  const [tickers, setTickers] = useState([])
  const [sectors, setSectors] = useState([])
  const [oppRiskList, setOppRiskList] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [newSectorName, setNewSectorName] = useState('')
  const [creatingSector, setCreatingSector] = useState(false)

  // Selection & Form State
  const [selectedTicker, setSelectedTicker] = useState('')
  const [tickerQuery, setTickerQuery] = useState('')
  const [form, setForm] = useState({
    about_company: '',
    opportunities: '',
    risk: '',
    is_multibagger: false,
    additional_note: '',
    sector_ids: []
  })

  const { show, ToastContainer } = useToast()

  // Inline creation of new sector master entry
  const handleCreateSector = async () => {
    const name = newSectorName.trim()
    if (!name) return

    // Check if sector already exists in local list
    const existing = sectors.find(s => s.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      if (!form.sector_ids.includes(existing.id)) {
        setForm(prev => ({ ...prev, sector_ids: [...prev.sector_ids, existing.id] }))
      }
      setNewSectorName('')
      show(`Sector '${existing.name}' selected.`, 'info')
      return
    }

    setCreatingSector(true)
    try {
      const created = await api.sectors.create({ name, description: 'Added via Opportunities & Risk manager' })
      show(`Created & added new sector '${name}' to Sector Master`, 'success')
      
      // Update local sector list and auto-select new sector ID
      setSectors(prev => [...prev, created])
      setForm(prev => ({ ...prev, sector_ids: [...prev.sector_ids, created.id] }))
      setNewSectorName('')
    } catch (e) {
      show('Failed to create sector: ' + e.message, 'error')
    } finally {
      setCreatingSector(false)
    }
  }

  // Load initial data
  const loadData = async () => {
    setLoading(true)
    try {
      const [tList, sList, oppRes] = await Promise.all([
        api.tickers.list({}),
        api.sectors.list(),
        fetch('/api/opportunities-risk').then(r => r.ok ? r.json() : [])
      ])
      setTickers(tList || [])
      setSectors(sList || [])
      setOppRiskList(oppRes || [])
    } catch (e) {
      show('Failed to load data: ' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  // Filtered ticker list for selector query box
  const filteredTickers = useMemo(() => {
    const q = tickerQuery.trim().toLowerCase()
    if (!q) return tickers
    return tickers.filter(t => (t.ticker || '').toLowerCase().includes(q) || (t.company_name || '').toLowerCase().includes(q))
  }, [tickers, tickerQuery])

  // When a ticker is selected, load its existing Opp & Risk record + secondary sectors
  const handleSelectTicker = async (symbol) => {
    if (!symbol) {
      setSelectedTicker('')
      setForm({ about_company: '', opportunities: '', risk: '', is_multibagger: false, additional_note: '', sector_ids: [] })
      return
    }

    setSelectedTicker(symbol)
    try {
      const res = await fetch(`/api/opportunities-risk/${encodeURIComponent(symbol)}`)
      if (res.ok) {
        const data = await res.json()
        setForm({
          about_company: data.about_company || '',
          opportunities: data.opportunities || '',
          risk: data.risk || '',
          is_multibagger: Boolean(data.is_multibagger),
          additional_note: data.additional_note || '',
          sector_ids: data.sector_ids || []
        })
      }
    } catch (e) {
      show(`Error loading records for ${symbol}: ${e.message}`, 'error')
    }
  }

  // Save Opportunities & Risk record
  const handleSave = async () => {
    if (!selectedTicker) {
      return show('Please select a ticker symbol first', 'error')
    }

    setSaving(true)
    try {
      const payload = {
        ticker: selectedTicker,
        about_company: form.about_company,
        opportunities: form.opportunities,
        risk: form.risk,
        is_multibagger: form.is_multibagger,
        additional_note: form.additional_note,
        sector_ids: form.sector_ids
      }

      const res = await fetch('/api/opportunities-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) throw new Error('Failed to save record')
      show(`Saved Opportunities & Risk analysis for ${selectedTicker}`, 'success')
      
      // Reset form allowing to add new and clear selections
      setSelectedTicker('')
      setTickerQuery('')
      setNewSectorName('')
      setForm({
        about_company: '',
        opportunities: '',
        risk: '',
        is_multibagger: false,
        additional_note: '',
        sector_ids: []
      })

      loadData()
    } catch (e) {
      show(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // Filter existing records for table
  const filteredRecords = useMemo(() => {
    if (!search) return oppRiskList
    const q = search.toLowerCase()
    return oppRiskList.filter(r =>
      r.ticker.toLowerCase().includes(q) ||
      (r.company_name || '').toLowerCase().includes(q) ||
      (r.about_company || '').toLowerCase().includes(q) ||
      (r.opportunities || '').toLowerCase().includes(q) ||
      (r.risk || '').toLowerCase().includes(q)
    )
  }, [oppRiskList, search])

  const pagedRecords = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filteredRecords.slice(start, start + PAGE_SIZE)
  }, [filteredRecords, page])

  const selectedTickerMeta = useMemo(() => {
    return tickers.find(t => t.ticker === selectedTicker) || {}
  }, [tickers, selectedTicker])

  return (
    <div className="master-page">
      {ToastContainer}
      <SectionHeader
        title="About Company Manager & Business Sector Mapping"
        sub="Maintain company products/services profiles, map secondary business sectors, evaluate key growth catalysts, risks, and multibagger potential."
      />

      {/* Editor & Configuration Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 20, marginBottom: 24 }}>
        
        {/* Left Column: Ticker & Multi-Sector Selector */}
        <div className="panel" style={{ background: '#0d1527', border: '1px solid #1e3250', borderRadius: 10, padding: 18 }}>
          <h3 style={{ margin: '0 0 14px 0', fontSize: 15, fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 8 }}>
            🎯 1. Select Ticker & Secondary Sectors
          </h3>

          {/* Ticker Selector Query Box */}
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 700 }}>Search & Choose Ticker <span className="req">*</span></label>
            <input
              type="text"
              className="form-input"
              style={{ marginBottom: 6, fontSize: 13 }}
              placeholder="Type symbol or company name (e.g. RELIANCE)..."
              value={tickerQuery}
              onChange={e => setTickerQuery(e.target.value)}
            />
            <select
              className="form-input"
              style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8' }}
              value={selectedTicker}
              onChange={e => handleSelectTicker(e.target.value)}
            >
              <option value="">-- Choose Ticker ({filteredTickers.length} available) --</option>
              {filteredTickers.map(t => (
                <option key={t.ticker} value={t.ticker}>{t.ticker} — {t.company_name}</option>
              ))}
            </select>
          </div>

          {selectedTicker && (
            <div style={{ background: 'rgba(56, 189, 248, 0.08)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '10px 12px', borderRadius: 6, marginBottom: 16, fontSize: 12, color: '#cbd5e1' }}>
              <b style={{ color: '#38bdf8' }}>Selected: {selectedTicker}</b> — {selectedTickerMeta.company_name || selectedTicker}
              <div style={{ color: '#94a3b8', marginTop: 2 }}>Primary Sector: {selectedTickerMeta.sector || 'Unassigned'}</div>
            </div>
          )}

          {/* Multi-Sector Picker */}
          <div className="form-group">
            <label style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 700, marginBottom: 6, display: 'block' }}>
              Assign Secondary Business Sectors ({form.sector_ids.length} selected)
            </label>
            <div style={{ background: '#07101e', border: '1px solid #1e3250', borderRadius: 8, padding: 8, overflow: 'hidden' }}>
              <MultiPicker
                items={sectors.map(s => ({ id: s.id, name: s.name }))}
                selected={form.sector_ids}
                onChange={ids => setForm(prev => ({ ...prev, sector_ids: ids }))}
                labelKey="name"
                valueKey="id"
                listStyle={{ maxHeight: '85px', overflowY: 'auto' }}
              />
            </div>
            {/* Inline New Sector Creation Field */}
            <div style={{ marginTop: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="text"
                className="form-input"
                style={{ fontSize: 12, padding: '6px 10px', flex: 1 }}
                placeholder="Create new sector if not in list..."
                value={newSectorName}
                onChange={e => setNewSectorName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateSector() } }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={creatingSector || !newSectorName.trim()}
                onClick={handleCreateSector}
                style={{ padding: '6px 12px', fontSize: 12, background: '#1e293b', border: '1px solid #38bdf8', color: '#38bdf8', whiteSpace: 'nowrap', cursor: 'pointer' }}
              >
                {creatingSector ? 'Adding...' : '+ Add Sector'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: 4 Edit Fields (Opportunities, Risk, isMultiBagger, Additional Note) */}
        <div className="panel" style={{ background: '#0d1527', border: '1px solid #1e3250', borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: '0 0 14px 0', fontSize: 15, fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 8 }}>
              📝 2. Opportunities & Risk Edit Fields
            </h3>

            {/* Field 1: About Company (Products & Services) */}
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label style={{ color: '#38bdf8', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Shield size={14}/> 1) About Company (Products & Services Overview)
              </label>
              <textarea
                className="form-input"
                rows={2}
                style={{ fontSize: 13, background: '#07101e', borderColor: 'rgba(56, 189, 248, 0.3)', color: '#f8fafc' }}
                placeholder="Describe key products, services, target industries, and business operations..."
                value={form.about_company}
                onChange={e => setForm(prev => ({ ...prev, about_company: e.target.value }))}
              />
            </div>

            {/* Field 2: Opportunities */}
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label style={{ color: '#4ade80', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={14}/> 2) Growth Opportunities (Company Positives)
              </label>
              <textarea
                className="form-input"
                rows={2}
                style={{ fontSize: 13, background: '#07101e', borderColor: 'rgba(34, 197, 94, 0.3)', color: '#f8fafc' }}
                placeholder="List major growth catalysts, market expansion, product launches..."
                value={form.opportunities}
                onChange={e => setForm(prev => ({ ...prev, opportunities: e.target.value }))}
              />
            </div>

            {/* Field 3: Risk */}
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label style={{ color: '#f87171', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={14}/> 3) Business Risks (Company Negatives)
              </label>
              <textarea
                className="form-input"
                rows={2}
                style={{ fontSize: 13, background: '#07101e', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#f8fafc' }}
                placeholder="List regulatory threats, margin pressures, competition risks..."
                value={form.risk}
                onChange={e => setForm(prev => ({ ...prev, risk: e.target.value }))}
              />
            </div>

            {/* Field 4 & 5: Multibagger Flag & Additional Note */}
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 14, marginBottom: 14 }}>
              <div className="form-group">
                <label style={{ color: '#fbbf24', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Star size={14}/> 4) Multibagger Flag
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '10px 12px', borderRadius: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.is_multibagger}
                    onChange={e => setForm(prev => ({ ...prev, is_multibagger: e.target.checked }))}
                  />
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#facc15' }}>Is Multibagger</span>
                </label>
              </div>

              <div className="form-group">
                <label style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 700 }}>5) Additional Note</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ fontSize: 13, background: '#07101e' }}
                  placeholder="e.g. High conviction 3-year holding recommendation"
                  value={form.additional_note}
                  onChange={e => setForm(prev => ({ ...prev, additional_note: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <button className="btn-primary" onClick={handleSave} disabled={saving || !selectedTicker} style={{ padding: '10px 24px', fontSize: 14 }}>
              <Save size={16}/> {saving ? 'Saving...' : 'Save Record & Mappings'}
            </button>
          </div>
        </div>
      </div>

      {/* Summary Table of Saved Opportunities & Risk Records */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search saved records by ticker, risk, or opportunity..."/>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>
          Total records: <b style={{ color: '#38bdf8' }}>{filteredRecords.length}</b>
        </span>
      </div>

      <section className="panel data-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 120 }}>Ticker</th>
                <th style={{ width: 130 }}>Multibagger</th>
                <th>About Company</th>
                <th>Growth Opportunities</th>
                <th>Business Risks</th>
                <th>Additional Note</th>
                <th style={{ width: 80, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7}><div className="state">Loading records...</div></td></tr>}
              {!loading && pagedRecords.length === 0 && (
                <tr><td colSpan={7}><div className="state">No opportunities & risk records saved yet.</div></td></tr>
              )}
              {!loading && pagedRecords.map(r => (
                <tr key={r.ticker} className="data-row">
                  <td>
                    <b style={{ color: '#7ec8f0', fontFamily: "'DM Mono'", cursor: 'pointer' }} onClick={() => handleSelectTicker(r.ticker)}>
                      {r.ticker}
                    </b>
                    <span style={{ display: 'block', fontSize: 11, color: '#64748b' }}>{r.company_name}</span>
                  </td>
                  <td>
                    {r.is_multibagger ? (
                      <span style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#facc15', border: '1px solid #f59e0b', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4 }}>
                        🌟 MULTIBAGGER
                      </span>
                    ) : (
                      <span style={{ color: '#64748b', fontSize: 11 }}>Standard</span>
                    )}
                  </td>
                  <td style={{ color: '#38bdf8', fontSize: 12 }}>
                    <TruncatedCellText text={r.about_company} title="About Company Overview" maxLen={25} truncLen={20} />
                  </td>
                  <td style={{ color: '#4ade80', fontSize: 12 }}>
                    <TruncatedCellText text={r.opportunities} title="Growth Opportunities" maxLen={25} truncLen={20} />
                  </td>
                  <td style={{ color: '#f87171', fontSize: 12 }}>
                    <TruncatedCellText text={r.risk} title="Business Risks" maxLen={25} truncLen={20} />
                  </td>
                  <td style={{ color: '#cbd5e1', fontSize: 12 }}>
                    <TruncatedCellText text={r.additional_note} title="Additional Note" maxLen={20} truncLen={16} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button className="icon-btn sm" title="Edit record" onClick={() => handleSelectTicker(r.ticker)}>
                      ✏️ Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={filteredRecords.length} page={page} pageSize={PAGE_SIZE} onChange={setPage}/>
      </section>
    </div>
  )
}
