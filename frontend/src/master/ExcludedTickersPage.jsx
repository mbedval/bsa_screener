import React, { useEffect, useMemo, useState } from 'react'
import { Edit2, Plus, Trash2, Ban, ShieldAlert, GitCompare, AlertTriangle, CheckCircle } from 'lucide-react'
import * as api from './api.js'
import {
  useToast, Modal, ConfirmDialog, Pagination,
  SectionHeader, SearchBar, FormGroup, Input, Textarea
} from './ui.jsx'

const PAGE_SIZE = 10

export default function ExcludedTickersPage({ onNavigate }) {
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState(null)
  const [confirm, setConfirm]   = useState(null)
  const [saving, setSaving]     = useState(false)
  const [form, setForm]         = useState({ ticker: '', reason: '', added_by: 'MANUAL', status: 'EXCLUDED', last_error: '' })

  const [sortKey, setSortKey]   = useState('')
  const [sortAsc, setSortAsc]   = useState(true)

  const { show, ToastContainer } = useToast()

  const load = async () => {
    setLoading(true)
    try { setRows(await api.excludedTickers.list()) }
    catch (e) { show(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleSort = key => {
    setSortAsc(k => sortKey === key ? !sortAsc : true)
    setSortKey(key)
    setPage(1)
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let list = !q ? rows : rows.filter(r =>
      (r.ticker || '').toLowerCase().includes(q) ||
      (r.reason || '').toLowerCase().includes(q) ||
      (r.added_by || '').toLowerCase().includes(q) ||
      (r.status || '').toLowerCase().includes(q) ||
      (r.last_error || '').toLowerCase().includes(q)
    )
    if (sortKey) {
      list = [...list].sort((a, b) => {
        const valA = a[sortKey] ?? ''
        const valB = b[sortKey] ?? ''
        return String(valA).localeCompare(String(valB), undefined, { numeric: true }) * (sortAsc ? 1 : -1)
      })
    }
    return list
  }, [rows, search, sortKey, sortAsc])

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const openNew = () => {
    setEditing(null)
    setForm({ ticker: '', reason: '', added_by: 'MANUAL', status: 'EXCLUDED', last_error: '' })
    setShowForm(true)
  }

  const openEdit = row => {
    setEditing(row)
    setForm({
      ticker: row.ticker || '',
      reason: row.reason || '',
      added_by: row.added_by || 'MANUAL',
      status: row.status || 'EXCLUDED',
      last_error: row.last_error || ''
    })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.ticker.trim()) return
    setSaving(true)
    try {
      const body = {
        ticker: form.ticker.trim().toUpperCase(),
        reason: form.reason.trim() || 'Manual exclusion from master interface',
        added_by: form.added_by || 'MANUAL',
        status: form.status || 'EXCLUDED',
        last_error: form.last_error.trim() || null
      }
      if (editing) {
        await api.excludedTickers.update(editing.id, body)
        show('Exclusion record updated')
      } else {
        await api.excludedTickers.create(body)
        show('Ticker added to exclusion list')
      }
      setShowForm(false)
      load()
    } catch (e) { show(e.message, 'error') }
    finally { setSaving(false) }
  }

  const del = async id => {
    try {
      await api.excludedTickers.remove(id)
      show('Ticker removed from exclusion list — re-enabled for data processing')
      load()
    } catch (e) { show(e.message, 'error') }
  }

  return (
    <div className="master-page">
      {ToastContainer}
      <SectionHeader
        title="Excluded Tickers (Logical Exclusion Layer)"
        sub={`${filtered.length} stock${filtered.length !== 1 ? 's' : ''} excluded · automatically bypassed in all data downloads, indicators & analysis pipelines`}
        actions={<button className="btn-primary" onClick={openNew}><Plus size={14}/> Add Excluded Ticker</button>}
      />

      <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search ticker, reason, error log, added_by..."/>

      <section className="panel data-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th onClick={() => handleSort('ticker')} style={{cursor:'pointer'}}>Excluded Ticker</th>
                <th onClick={() => handleSort('added_by')} style={{cursor:'pointer'}}>Origin / Source</th>
                <th onClick={() => handleSort('reason')} style={{cursor:'pointer'}}>Exclusion Reason</th>
                <th onClick={() => handleSort('last_error')} style={{cursor:'pointer'}}>Last Error Log</th>
                <th onClick={() => handleSort('created_at')} style={{cursor:'pointer'}}>Date Added</th>
                <th style={{width:140}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6}><div className="state">Loading exclusion list…</div></td></tr>}
              {!loading && paged.length === 0 && (
                <tr><td colSpan={6}><div className="state">No excluded tickers recorded.</div></td></tr>
              )}
              {!loading && paged.map(row => {
                const isAuto = (row.added_by || '').toUpperCase() === 'SYSTEM_AUTO'
                return (
                  <tr key={row.id} className="data-row">
                    <td>
                      <div style={{display:'flex', alignItems:'center', gap:8}}>
                        <Ban size={14} style={{color:'#ff4d4f'}}/>
                        <b style={{color:'#ff4d4f', fontFamily:"'DM Mono'"}}>{row.ticker}</b>
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${isAuto ? 'sell' : 'neutral'}`} style={{fontSize:11, padding:'2px 8px'}}>
                        {isAuto ? '🤖 SYSTEM AUTO' : '👤 MANUAL'}
                      </span>
                    </td>
                    <td style={{color:'#e1e6ed', fontSize:13, maxWidth:260, overflow:'hidden', textOverflow:'ellipsis'}}>
                      {row.reason || '—'}
                    </td>
                    <td style={{color:'#8a9ab0', fontSize:12, fontFamily:"'DM Mono'", maxWidth:240, overflow:'hidden', textOverflow:'ellipsis'}}>
                      {row.last_error || '—'}
                    </td>
                    <td style={{fontSize:12, color:'#8a9ab0'}}>{row.created_at ? row.created_at.slice(0, 10) : '—'}</td>
                    <td>
                      <div className="row-actions" style={{display:'flex', gap:6}}>
                        <button
                          className="icon-btn sm"
                          title="Configure Ticker Alias / Name Change"
                          style={{color:'#7ec8f0'}}
                          onClick={() => onNavigate && onNavigate('aliases')}
                        >
                          <GitCompare size={13}/>
                        </button>
                        <button className="icon-btn sm" title="Edit Reason" onClick={() => openEdit(row)}>
                          <Edit2 size={13}/>
                        </button>
                        <button
                          className="icon-btn sm danger"
                          title="Remove from exclusion list (Re-enable stock)"
                          onClick={() => setConfirm(row)}
                        >
                          <Trash2 size={13}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onChange={setPage}/>
      </section>

      {/* Add / Edit modal */}
      {showForm && (
        <Modal title={editing ? `Edit Exclusion Reason for ${editing.ticker}` : 'Add Ticker to Logical Exclusion Layer'} onClose={() => setShowForm(false)} size="md">
          <FormGroup label="Stock Ticker Symbol" hint="e.g. ABAN, DEWAN" required>
            <Input
              value={form.ticker}
              disabled={!!editing}
              onChange={e => setForm(f => ({ ...f, ticker: e.target.value.toUpperCase() }))}
              placeholder="e.g. ABAN"
            />
          </FormGroup>

          <FormGroup label="Exclusion Reason" hint="Why should this stock be skipped?" required>
            <Input
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Download error: Stock unlisted / delisted from exchange"
            />
          </FormGroup>

          <FormGroup label="Last Error Log / Details" hint="optional">
            <Textarea
              rows={2}
              value={form.last_error}
              onChange={e => setForm(f => ({ ...f, last_error: e.target.value }))}
              placeholder="e.g. yfinance HTTP 404: Symbol not found"
            />
          </FormGroup>

          <div className="form-actions">
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving || !form.ticker.trim()}>
              {saving ? 'Saving…' : editing ? 'Update Exclusion' : 'Add Excluded Ticker'}
            </button>
          </div>
        </Modal>
      )}

      {/* Confirm Delete modal */}
      {confirm && (
        <ConfirmDialog
          title="Re-enable Stock (Remove Exclusion)?"
          message={`Are you sure you want to remove ticker "${confirm.ticker}" from the exclusion list? Data downloaders and pipelines will resume processing this stock.`}
          onConfirm={() => { del(confirm.id); setConfirm(null) }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
