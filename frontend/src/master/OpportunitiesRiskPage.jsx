import React, { useEffect, useState } from 'react'
import { Plus, Search, Tag, TrendingUp, ShieldAlert, CheckCircle2, Star, Edit3, Trash2, Download } from 'lucide-react'
import * as api from './api.js'
import { useToast, Modal, ConfirmDialog, Pagination, SectionHeader, SearchBar, TruncatedCellText } from './ui.jsx'

export default function OpportunitiesRiskPage() {
  const [tickers, setTickers] = useState([])
  const [sectors, setSectors] = useState([])
  const [savedRecords, setSavedRecords] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Selection & Form State
  const [selectedTicker, setSelectedTicker] = useState('')
  const [selectedSectors, setSelectedSectors] = useState([])
  const [form, setForm] = useState({
    about_company: '',
    opportunities: '',
    risk: '',
    is_multibagger: false,
    additional_note: ''
  })
  
  // Create Sector Modal State
  const [showCreateSector, setShowCreateSector] = useState(false)
  const [newSectorName, setNewSectorName] = useState('')
  
  // UI Table Search & Pagination State
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 10
  
  const { show, ToastContainer } = useToast()

  const loadData = async () => {
    setLoading(true)
    try {
      const [tList, sList] = await Promise.all([
        api.tickers.list(),
        api.sectors.list()
      ])
      setTickers(tList || [])
      setSectors(sList || [])
      
      // Fetch saved opportunities_risk list from backend
      const res = await fetch('/api/opportunities-risk')
      if (res.ok) {
        const data = await res.json()
        setSavedRecords(data || [])
      }
    } catch (e) {
      show(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleTickerSelect = async (symbol) => {
    setSelectedTicker(symbol)
    if (!symbol) {
      setForm({
        about_company: '',
        opportunities: '',
        risk: '',
        is_multibagger: false,
        additional_note: ''
      })
      setSelectedSectors([])
      return
    }

    try {
      const res = await fetch(`/api/opportunities-risk/${encodeURIComponent(symbol)}`)
      if (res.ok) {
        const data = await res.json()
        setForm({
          about_company: data.about_company || '',
          opportunities: data.opportunities || '',
          risk: data.risk || '',
          is_multibagger: !!data.is_multibagger,
          additional_note: data.additional_note || ''
        })
        setSelectedSectors(data.sector_ids || [])
      }
    } catch (e) {
      show('Failed to fetch ticker opportunities details', 'error')
    }
  }

  const handleSave = async () => {
    if (!selectedTicker) {
      show('Please select a ticker first.', 'error')
      return
    }

    try {
      const payload = {
        ticker: selectedTicker,
        about_company: form.about_company,
        opportunities: form.opportunities,
        risk: form.risk,
        is_multibagger: form.is_multibagger,
        additional_note: form.additional_note,
        sector_ids: selectedSectors
      }

      const res = await fetch('/api/opportunities-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) throw new Error('Failed to save record')

      show(`Saved Opportunities & Risk analysis for ${selectedTicker}`, 'success')
      loadData()
    } catch (e) {
      show(e.message, 'error')
    }
  }

  const handleCreateSector = async () => {
    if (!newSectorName.trim()) return
    try {
      const created = await api.sectors.create({ name: newSectorName.trim(), description: 'Created from Opportunities & Risk page' })
      show(`Sector '${created.name}' created`, 'success')
      setNewSectorName('')
      setShowCreateSector(false)
      const sList = await api.sectors.list()
      setSectors(sList || [])
      if (created.id && !selectedSectors.includes(created.id)) {
        setSelectedSectors(prev => [...prev, created.id])
      }
    } catch (e) {
      show(e.message, 'error')
    }
  }

  const handleDelete = async (symbol) => {
    try {
      const res = await fetch(`/api/opportunities-risk/${encodeURIComponent(symbol)}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete record')
      show(`Deleted record for ${symbol}`, 'success')
      if (selectedTicker === symbol) {
        setSelectedTicker('')
        setForm({ about_company: '', opportunities: '', risk: '', is_multibagger: false, additional_note: '' })
        setSelectedSectors([])
      }
      loadData()
    } catch (e) {
      show(e.message, 'error')
    }
  }

  const toggleSector = (id) => {
    setSelectedSectors(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const filteredRecords = savedRecords.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return (r.ticker || '').toLowerCase().includes(q) ||
           (r.company_name || '').toLowerCase().includes(q) ||
           (r.about_company || '').toLowerCase().includes(q) ||
           (r.opportunities || '').toLowerCase().includes(q) ||
           (r.risk || '').toLowerCase().includes(q)
  })

  const pagedRecords = filteredRecords.slice((page - 1) * pageSize, page * pageSize)

  const downloadCSV = () => {
    if (!savedRecords || savedRecords.length === 0) return
    const headers = ['ticker', 'company_name', 'about_company', 'product_and_service', 'sectors', 'opportunities', 'risk', 'is_multibagger', 'additional_note']
    const csvLines = [headers.join(',')]
    savedRecords.forEach(r => {
      const line = [
        `"${r.ticker || ''}"`,
        `"${(r.company_name || '').replace(/"/g, '""')}"`,
        `"${(r.about_company || '').replace(/"/g, '""')}"`,
        `"${(r.product_services || '').replace(/"/g, '""')}"`,
        `"${(r.sectors || '').replace(/"/g, '""')}"`,
        `"${(r.opportunities || '').replace(/"/g, '""')}"`,
        `"${(r.risk || '').replace(/"/g, '""')}"`,
        r.is_multibagger ? 'YES' : 'NO',
        `"${(r.additional_note || '').replace(/"/g, '""')}"`
      ]
      csvLines.push(line.join(','))
    })
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'oppurtunityandrisk.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="master-page" style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      {ToastContainer}

      <SectionHeader
        title="About Company Management"
        sub="Map qualitative growth catalysts, business risks, and multi-sector categories to tickers"
        actions={
          <button className="btn-secondary" onClick={downloadCSV} title="Download opportunities and risk dataset as CSV">
            <Download size={14}/> Download CSV
          </button>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, marginBottom: 24 }}>
        
        {/* Left Column: Ticker & Sector Selector Card */}
        <div className="panel" style={{ padding: 20, background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: 12 }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 16, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
            🎯 1. Select Ticker Symbol
          </h3>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 700 }}>
              SEARCH / CHOOSE TICKER:
            </label>
            <select
              value={selectedTicker}
              onChange={e => handleTickerSelect(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, fontSize: 14, fontFamily: "'DM Mono', monospace" }}
            >
              <option value="">-- Select a Master Ticker --</option>
              {tickers.map(t => (
                <option key={t.ticker} value={t.ticker}>
                  {t.ticker} - {t.company_name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#38bdf8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Tag size={14}/> MAP SECTORS ({selectedSectors.length}):
              </label>
              <button
                onClick={() => setShowCreateSector(true)}
                style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.4)', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Plus size={12}/> New Sector
              </button>
            </div>

            <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
              {sectors.map(s => {
                const isSelected = selectedSectors.includes(s.id)
                return (
                  <div
                    key={s.id}
                    onClick={() => toggleSector(s.id)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 6,
                      fontSize: 13,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justify: 'space-between',
                      background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.02)',
                      border: isSelected ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.06)',
                      color: isSelected ? '#38bdf8' : '#cbd5e1'
                    }}
                  >
                    <span>{s.name}</span>
                    {isSelected && <CheckCircle2 size={14} style={{ color: '#38bdf8' }} />}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Edit Fields Card */}
        <div className="panel" style={{ padding: 20, background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
              📝 2. Opportunities & Risk Edit Fields {selectedTicker && <span style={{ color: '#38bdf8', fontFamily: "'DM Mono'" }}>({selectedTicker})</span>}
            </h3>
            <button
              onClick={handleSave}
              disabled={!selectedTicker}
              style={{
                background: selectedTicker ? 'linear-gradient(135deg, #38bdf8, #0284c7)' : 'rgba(255,255,255,0.1)',
                color: selectedTicker ? '#0f172a' : '#64748b',
                border: 'none',
                borderRadius: 8,
                padding: '8px 20px',
                fontSize: 13,
                fontWeight: 800,
                cursor: selectedTicker ? 'pointer' : 'not-allowed'
              }}
            >
              Save Record
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Field 1: About Company */}
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#38bdf8', fontWeight: 700, marginBottom: 4 }}>
                🏢 1) About Company (Products & Services Overview)
              </label>
              <textarea
                rows={3}
                value={form.about_company}
                onChange={e => setForm(prev => ({ ...prev, about_company: e.target.value }))}
                placeholder="Enter detailed company profile, product portfolio, and key operating segments..."
                style={{ width: '100%', padding: 10, background: 'rgba(0,0,0,0.4)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, fontSize: 13, resize: 'vertical' }}
              />
            </div>

            {/* Field 2: Growth Opportunities */}
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#4ade80', fontWeight: 700, marginBottom: 4 }}>
                🚀 2) Growth Opportunities (Company Positives)
              </label>
              <textarea
                rows={3}
                value={form.opportunities}
                onChange={e => setForm(prev => ({ ...prev, opportunities: e.target.value }))}
                placeholder="Enter growth catalysts, industry tailwinds, margin expansion, capacity additions..."
                style={{ width: '100%', padding: 10, background: 'rgba(0,0,0,0.4)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, fontSize: 13, resize: 'vertical' }}
              />
            </div>

            {/* Field 3: Business Risk */}
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#f87171', fontWeight: 700, marginBottom: 4 }}>
                ⚠️ 3) Business Risks & Threats (Company Negatives)
              </label>
              <textarea
                rows={3}
                value={form.risk}
                onChange={e => setForm(prev => ({ ...prev, risk: e.target.value }))}
                placeholder="Enter key threats, raw material volatility, debt levels, regulatory risks..."
                style={{ width: '100%', padding: 10, background: 'rgba(0,0,0,0.4)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, fontSize: 13, resize: 'vertical' }}
              />
            </div>

            {/* Field 4: Additional Analyst Note & Multibagger Checkbox */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 12, alignItems: 'center' }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#facc15', fontWeight: 700, marginBottom: 4 }}>
                  💡 4) Additional Analyst Note
                </label>
                <input
                  type="text"
                  value={form.additional_note}
                  onChange={e => setForm(prev => ({ ...prev, additional_note: e.target.value }))}
                  placeholder="Key takeaway or summary note..."
                  style={{ width: '100%', padding: 8, background: 'rgba(0,0,0,0.4)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, fontSize: 13 }}
                />
              </div>

              <div style={{ paddingTop: 18 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#facc15', fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={form.is_multibagger}
                    onChange={e => setForm(prev => ({ ...prev, is_multibagger: e.target.checked }))}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  🌟 Potential Multibagger
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Table of Saved Opportunities & Risk Records */}
      <section className="panel data-panel" style={{ padding: 20, background: 'rgba(15, 23, 42, 0.8)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: '#f8fafc' }}>
            📋 Saved Opportunities & Risk Records ({savedRecords.length})
          </h3>
          <div style={{ width: 300 }}>
            <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search saved records..." />
          </div>
        </div>

        <div className="table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.4)', color: '#94a3b8', fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: '10px 12px' }}>Ticker</th>
                <th style={{ padding: '10px 12px' }}>Company Name</th>
                <th style={{ padding: '10px 12px' }}>About Company</th>
                <th style={{ padding: '10px 12px' }}>Growth Opportunities</th>
                <th style={{ padding: '10px 12px' }}>Business Risk</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Multibagger</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7}><div className="state">Loading records...</div></td></tr>}
              {!loading && pagedRecords.length === 0 && (
                <tr><td colSpan={7}><div className="state">No opportunities & risk records saved yet.</div></td></tr>
              )}
              {!loading && pagedRecords.map(r => (
                <tr key={r.ticker} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#38bdf8', fontFamily: "'DM Mono'" }}>{r.ticker}</td>
                  <td style={{ padding: '10px 12px', color: '#f8fafc' }}>{r.company_name || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>
                    <TruncatedCellText text={r.about_company} />
                  </td>
                  <td style={{ padding: '10px 12px', color: '#4ade80' }}>
                    <TruncatedCellText text={r.opportunities} />
                  </td>
                  <td style={{ padding: '10px 12px', color: '#f87171' }}>
                    <TruncatedCellText text={r.risk} />
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {r.is_multibagger ? <span style={{ color: '#facc15', fontSize: 14 }}>⭐ YES</span> : <span style={{ color: '#64748b' }}>No</span>}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button className="icon-btn sm" title="Edit" onClick={() => handleTickerSelect(r.ticker)}><Edit3 size={13}/></button>
                      <button className="icon-btn sm danger" title="Delete" onClick={() => handleDelete(r.ticker)}><Trash2 size={13}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={filteredRecords.length} page={page} pageSize={pageSize} onChange={setPage} />
      </section>

      {/* Modal for creating a new Sector */}
      {showCreateSector && (
        <Modal title="Create New Sector" onClose={() => setShowCreateSector(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '10px 0' }}>
            <label style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>Sector Name:</label>
            <input
              type="text"
              value={newSectorName}
              onChange={e => setNewSectorName(e.target.value)}
              placeholder="e.g. Artificial Intelligence & Robotics"
              style={{ width: '100%', padding: '10px 12px', background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, fontSize: 14 }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <button className="btn-secondary" onClick={() => setShowCreateSector(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleCreateSector}>Create Sector</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
