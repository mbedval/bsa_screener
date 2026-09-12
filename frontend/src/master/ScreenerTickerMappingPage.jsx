import React, { useEffect, useMemo, useState } from 'react'
import { Edit2, Plus, Trash2, ArrowRightLeft, Zap } from 'lucide-react'
import * as api from './api.js'
import {
  useToast, Modal, ConfirmDialog, Pagination,
  SectionHeader, SearchBar, FormGroup, Input, Textarea, CountBadge, TruncatedCellText
} from './ui.jsx'

const PAGE_SIZE = 10
const EMPTY_FORM = { yfinance_ticker: '', screener_ticker: '', screener_company_id: '', company_name: '', notes: '' }

export default function ScreenerTickerMappingPage() {
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState(null)
  const [confirm, setConfirm]   = useState(null)
  const [saving, setSaving]     = useState(false)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [sortKey, setSortKey]   = useState('')
  const [sortAsc, setSortAsc]   = useState(true)

  const { show, ToastContainer } = useToast()

  const load = async () => {
    setLoading(true)
    try { setRows(await api.screenerTickerMappings.list()) }
    catch (e) { show(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleSort = key => {
    setSortAsc(sortKey === key ? !sortAsc : true)
    setSortKey(key)
    setPage(1)
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let list = !q ? rows : rows.filter(r =>
      (r.yfinance_ticker || '').toLowerCase().includes(q) ||
      (r.screener_ticker || '').toLowerCase().includes(q) ||
      (r.company_name    || '').toLowerCase().includes(q) ||
      (r.notes           || '').toLowerCase().includes(q)
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
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEdit = row => {
    setEditing(row)
    setForm({
      yfinance_ticker:    row.yfinance_ticker    || '',
      screener_ticker:    row.screener_ticker    || '',
      screener_company_id: row.screener_company_id != null ? String(row.screener_company_id) : '',
      company_name:       row.company_name       || '',
      notes:              row.notes              || ''
    })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.yfinance_ticker.trim() || !form.screener_ticker.trim()) {
      show('YFinance Ticker and Screener Ticker are required.', 'error')
      return
    }
    const cid = form.screener_company_id.trim()
    if (cid && isNaN(Number(cid))) {
      show('Screener Company ID must be a number.', 'error')
      return
    }
    setSaving(true)
    try {
      const body = {
        yfinance_ticker:     form.yfinance_ticker.trim().toUpperCase(),
        screener_ticker:     form.screener_ticker.trim().toUpperCase(),
        screener_company_id: cid ? Number(cid) : null,
        company_name:        form.company_name.trim() || null,
        notes:               form.notes.trim()        || null
      }
      if (editing) {
        await api.screenerTickerMappings.update(editing.id, body)
        show('Screener ticker mapping updated', 'success')
      } else {
        await api.screenerTickerMappings.create(body)
        show('Screener ticker mapping created', 'success')
      }
      setShowForm(false)
      load()
    } catch (e) { show(e.message, 'error') }
    finally { setSaving(false) }
  }

  const del = async id => {
    try {
      await api.screenerTickerMappings.remove(id)
      show('Mapping deleted', 'success')
      load()
    } catch (e) { show(e.message, 'error') }
  }

  const th = (key, label) => (
    <th onClick={() => handleSort(key)} style={{ cursor: 'pointer', userSelect: 'none' }}>
      {label} {sortKey === key ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  )

  return (
    <div className="master-page">
      {ToastContainer}

      <SectionHeader
        title="Screener.in Ticker Mappings"
        sub="Map YFinance ticker symbols to their Screener.in equivalents. Set Direct Company ID to bypass search for tickers with hyphens or special characters (e.g. NAM-INDIA, BAJAJ-AUTO)."
        actions={
          <button className="btn-primary" onClick={openNew}>
            <Plus size={14}/> Add Mapping
          </button>
        }
      />

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <SearchBar
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search yfinance ticker, screener ticker, company..."
          />
        </div>
        <CountBadge count={filtered.length} />
      </div>

      <div className="table-wrapper">
        <table className="master-table">
          <thead>
            <tr>
              <th style={{ width: 50 }}>#</th>
              {th('yfinance_ticker', 'YFinance Ticker')}
              <th style={{ width: 36, textAlign: 'center', padding: '0 4px' }}></th>
              {th('screener_ticker', 'Screener.in Ticker')}
              {th('screener_company_id', 'Direct Company ID')}
              {th('company_name', 'Company Name')}
              {th('notes', 'Notes')}
              {th('last_updated', 'Updated')}
              <th style={{ width: 90 }}/>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9}><div className="state">Loading screener ticker mappings...</div></td></tr>
            )}
            {!loading && paged.length === 0 && (
              <tr><td colSpan={9}><div className="state">No screener ticker mappings found. Click "Add Mapping" to create one.</div></td></tr>
            )}
            {!loading && paged.map((row, idx) => (
              <tr key={row.id} className="data-row">
                <td style={{ color: '#64748b', fontWeight: 600 }}>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                <td>
                  <b style={{ color: '#e5a93c', fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
                    <TruncatedCellText text={row.yfinance_ticker} maxLen={20} />
                  </b>
                </td>
                <td style={{ textAlign: 'center', padding: '0 2px' }}>
                  <ArrowRightLeft size={13} style={{ color: '#52c41a', opacity: 0.8 }}/>
                </td>
                <td>
                  <span style={{ color: '#38bdf8', fontWeight: 700, fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
                    <TruncatedCellText text={row.screener_ticker} maxLen={20} />
                  </span>
                </td>
                <td>
                  {row.screener_company_id ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: 'rgba(82,196,26,0.12)', color: '#52c41a',
                      padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>
                      <Zap size={11}/>{row.screener_company_id}
                    </span>
                  ) : (
                    <span style={{ color: '#475569', fontSize: 12 }}>— search</span>
                  )}
                </td>
                <td style={{ color: '#cbd5e1', fontSize: 13 }}>
                  <TruncatedCellText text={row.company_name || '—'} maxLen={25} />
                </td>
                <td style={{ color: '#7090b0', fontSize: 12 }}>
                  <TruncatedCellText text={row.notes || '—'} maxLen={30} />
                </td>
                <td style={{ fontSize: 12, color: '#8a9ab0' }}>
                  {row.last_updated ? row.last_updated.slice(0, 10) : '—'}
                </td>
                <td>
                  <div className="row-actions">
                    <button className="icon-btn sm" title="Edit mapping" onClick={() => openEdit(row)}>
                      <Edit2 size={13}/>
                    </button>
                    <button className="icon-btn sm danger" title="Delete mapping" onClick={() => setConfirm(row)}>
                      <Trash2 size={13}/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onChange={setPage}/>

      {showForm && (
        <Modal
          title={editing ? 'Edit Screener Ticker Mapping' : 'Add Screener Ticker Mapping'}
          onClose={() => setShowForm(false)}
          size="md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-grid2">
              <FormGroup label="YFinance Ticker" hint="e.g. NAM-INDIA" required>
                <Input
                  value={form.yfinance_ticker}
                  disabled={!!editing}
                  onChange={e => setForm(f => ({ ...f, yfinance_ticker: e.target.value.toUpperCase() }))}
                  placeholder="e.g. NAM-INDIA"
                />
              </FormGroup>
              <FormGroup label="Screener.in Ticker" hint="URL slug used by screener.in" required>
                <Input
                  value={form.screener_ticker}
                  onChange={e => setForm(f => ({ ...f, screener_ticker: e.target.value.toUpperCase() }))}
                  placeholder="e.g. NAM-INDIA"
                  autoFocus={!editing}
                />
              </FormGroup>
            </div>

            <FormGroup
              label="Direct Company ID"
              hint="⚡ Set this to bypass search — use for tickers with hyphens or special characters"
            >
              <Input
                value={form.screener_company_id}
                onChange={e => setForm(f => ({ ...f, screener_company_id: e.target.value.replace(/\D/g, '') }))}
                placeholder="e.g. 1274188  (find at screener.in/company/NAM-INDIA/)"
                style={{ fontFamily: "'DM Mono', monospace" }}
              />
            </FormGroup>

            <FormGroup label="Company Name" hint="optional">
              <Input
                value={form.company_name}
                onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                placeholder="e.g. Nippon Life India Asset Management Ltd"
              />
            </FormGroup>
            <FormGroup label="Notes / Reason" hint="why this mapping is needed">
              <Textarea
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. Hyphen in ticker breaks screener.in search; using direct company ID"
              />
            </FormGroup>
            <div className="form-actions">
              <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              <button
                className="btn-primary"
                onClick={save}
                disabled={saving || !form.yfinance_ticker.trim() || !form.screener_ticker.trim()}
              >
                {saving ? 'Saving...' : editing ? 'Update Mapping' : 'Save Mapping'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          title="Delete Screener Ticker Mapping?"
          message={`Remove mapping "${confirm.yfinance_ticker} → ${confirm.screener_ticker}"?`}
          onConfirm={() => { del(confirm.id); setConfirm(null) }}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
