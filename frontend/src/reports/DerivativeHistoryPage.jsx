import React, { useState, useEffect, useMemo } from 'react'
import { Layers, Search, Download, CheckCircle2, XCircle } from 'lucide-react'

export default function DerivativeHistoryPage({ setActive, onSelectTicker }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ALL') // ALL, ACTIVE, INACTIVE

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/master/derivative_history')
      if (!res.ok) throw new Error('Failed to fetch derivative history')
      const json = await res.json()
      setData(json)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const aggregatedData = useMemo(() => {
    const map = new Map()
    data.forEach(item => {
      if (!map.has(item.symbol)) {
        map.set(item.symbol, { symbol: item.symbol, events: [] })
      }
      map.get(item.symbol).events.push(item)
    })

    const result = []
    map.forEach(({ symbol, events }) => {
      const entryRecord = events.find(h => h.action === 'ENTRY')
      const exitRecord = events.find(h => h.action === 'EXIT')
      const lotChangeRecords = events.filter(h => h.action === 'LOT_CHANGE').sort((a, b) => new Date(b.action_date) - new Date(a.action_date))

      const status = exitRecord ? 'INACTIVE' : 'ACTIVE'
      const entryDate = entryRecord?.action_date || 'Since 24 Months'
      const exitDate = exitRecord ? exitRecord.action_date : '-'

      let currentLot = null
      let prevLot = null

      if (!exitRecord) {
        if (lotChangeRecords.length > 0) {
          currentLot = lotChangeRecords[0].lot_size
          if (lotChangeRecords.length > 1) {
            prevLot = lotChangeRecords[1].lot_size
          } else if (entryRecord && entryRecord.lot_size) {
            prevLot = entryRecord.lot_size
          }
        } else if (entryRecord && entryRecord.lot_size) {
          currentLot = entryRecord.lot_size
        }
      }

      result.push({
        symbol,
        status,
        entryDate,
        exitDate,
        currentLot,
        prevLot
      })
    })

    // Sort by status (ACTIVE first) then alphabetically
    return result.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'ACTIVE' ? -1 : 1;
      return a.symbol.localeCompare(b.symbol)
    })
  }, [data])

  const filteredData = aggregatedData.filter(item => {
    if (filter !== 'ALL' && item.status !== filter) return false
    if (search && !item.symbol.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const getStatusBadge = (status) => {
    if (status === 'ACTIVE') {
      return <span style={{ padding: '4px 8px', borderRadius: 4, background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', fontSize: 12, fontWeight: 600 }}><CheckCircle2 size={12} style={{ display: 'inline', marginRight: 4, marginBottom: -2 }} /> ACTIVE</span>
    } else {
      return <span style={{ padding: '4px 8px', borderRadius: 4, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontSize: 12, fontWeight: 600 }}><XCircle size={12} style={{ display: 'inline', marginRight: 4, marginBottom: -2 }} /> INACTIVE</span>
    }
  }

  const handleDownload = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Symbol,Status,Entry Date,Exit Date,Current Lot Size,Previous Lot Size\n"
      + filteredData.map(row => `${row.symbol},${row.status},${row.entryDate},${row.exitDate},${row.currentLot || 'Not Available'},${row.prevLot || '-'}`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "derivative_lifecycle_summary.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="report-page" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
          <Layers /> Derivative Lifecycle Summary
        </h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="search-bar" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-dark)', padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border-color)' }}>
            <Search size={14} style={{ marginRight: 8, color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Search ticker..." 
              value={search} 
              onChange={e => setSearch(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: '#fff', outline: 'none', width: 150 }}
            />
          </div>
          <select 
            value={filter} 
            onChange={e => setFilter(e.target.value)}
            style={{ background: 'var(--bg-dark)', color: '#fff', border: '1px solid var(--border-color)', borderRadius: 6, padding: '0 12px', outline: 'none' }}
          >
            <option value="ALL">All Symbols</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive Only</option>
          </select>
          <button className="icon-btn" onClick={handleDownload} title="Download CSV">
            <Download size={16} />
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="table-container" style={{ maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Status</th>
              <th>Entry Date</th>
              <th>Exit Date</th>
              <th style={{ textAlign: 'right' }}>Current Lot Size</th>
              <th style={{ textAlign: 'right' }}>Previous Lot Size</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40 }}>Loading history...</td></tr>
            ) : filteredData.length === 0 ? (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No records found.</td></tr>
            ) : (
              filteredData.map(row => (
                <tr key={row.symbol}>
                  <td>
                    <button 
                      onClick={() => onSelectTicker(row.symbol)}
                      style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                    >
                      {row.symbol}
                    </button>
                  </td>
                  <td>{getStatusBadge(row.status)}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: '#94a3b8' }}>{row.entryDate}</td>
                  <td style={{ fontFamily: "'DM Mono', monospace", color: row.exitDate !== '-' ? '#ef4444' : '#94a3b8' }}>{row.exitDate}</td>
                  <td style={{ textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
                    {row.currentLot ? (
                      <span style={{ color: '#f8fafc' }}>{row.currentLot.toLocaleString()}</span>
                    ) : (
                      <span style={{ color: '#64748b', fontStyle: 'italic', fontWeight: 400 }}>Not Available</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: "'DM Mono', monospace", fontWeight: 600 }}>
                    {row.prevLot ? (
                      <span style={{ color: '#94a3b8', textDecoration: 'line-through' }}>{row.prevLot.toLocaleString()}</span>
                    ) : (
                      <span style={{ color: '#475569' }}>-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
