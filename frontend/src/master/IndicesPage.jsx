import React, { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Edit2, Upload, Download, FileText, CheckCircle2, X } from 'lucide-react'
import * as api from './api.js'
import {
  useToast, Modal, ConfirmDialog, Pagination, SectionHeader, SearchBar,
  FormGroup, Input, Select, Checkbox, FnoBadge, CountBadge
} from './ui.jsx'

const PAGE_SIZE = 10

export default function IndicesPage({ dataset }) {
  const [rows, setRows]           = useState([])
  const [loading, setLoading]     = useState(true)
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterFno, setFilterFno] = useState('')
  const [sortKey, setSortKey]     = useState('symbol')
  const [sortAsc, setSortAsc]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState(null)
  const [confirm, setConfirm]     = useState(null)
  const [saving, setSaving]       = useState(false)
  const [form, setForm]           = useState({
    symbol: '',
    name: '',
    exchange: 'NSE',
    category: 'BENCHMARK',
    is_fno: true,
    lot_size: 25,
    benchmark_price: '',
    is_active: true
  })

  // File Upload State
  const [showImport, setShowImport] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)

  const { show, ToastContainer }  = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.indices.list({}, dataset)
      setRows(res)
    } catch (e) { show(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [dataset])

  const downloadCSV = () => {
    if (!rows || rows.length === 0) {
      show('No indices available to download', 'error')
      return
    }
    const headers = ['symbol', 'name', 'exchange', 'category', 'is_fno', 'lot_size', 'benchmark_price', 'is_active']
    const csvLines = [headers.join(',')]
    rows.forEach(r => {
      const row = [
        `"${(r.symbol || '').replace(/"/g, '""')}"`,
        `"${(r.name || '').replace(/"/g, '""')}"`,
        `"${(r.exchange || 'NSE').replace(/"/g, '""')}"`,
        `"${(r.category || 'BENCHMARK').replace(/"/g, '""')}"`,
        r.is_fno ? 'true' : 'false',
        r.lot_size ?? 0,
        r.benchmark_price ?? '',
        r.is_active ? 'true' : 'false'
      ]
      csvLines.push(row.join(','))
    })
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `indices_master_${dataset || 'default'}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    show('Indices master CSV downloaded', 'success')
  }

  // Extract unique categories for filter dropdown
  const categories = useMemo(() => {
    const set = new Set(rows.map(r => r.category).filter(Boolean))
    return Array.from(set).sort()
  }, [rows])

  // Filter & sort
  const filtered = useMemo(() => {
    let r = rows
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(i => i.symbol.toLowerCase().includes(q) || (i.name || '').toLowerCase().includes(q))
    }
    if (filterCategory) {
      r = r.filter(i => (i.category || '').toUpperCase() === filterCategory.toUpperCase())
    }
    if (filterFno !== '') {
      r = r.filter(i => String(i.is_fno) === filterFno)
    }
    if (sortKey) {
      r = [...r].sort((a, b) => {
        const av = (a[sortKey] ?? ''), bv = (b[sortKey] ?? '')
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * (sortAsc ? 1 : -1)
        return String(av).localeCompare(String(bv), undefined, { numeric: true }) * (sortAsc ? 1 : -1)
      })
    }
    return r
  }, [rows, search, filterCategory, filterFno, sortKey, sortAsc])

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const sort = key => { setSortKey(key); setSortAsc(k => sortKey === key ? !sortAsc : true); setPage(1) }

  const openNew = () => {
    setEditing(null)
    setForm({ symbol: '', name: '', exchange: 'NSE', category: 'BENCHMARK', is_fno: true, lot_size: 25, benchmark_price: '', is_active: true })
    setShowForm(true)
  }

  const openEdit = row => {
    setEditing(row)
    setForm({
      symbol: row.symbol,
      name: row.name,
      exchange: row.exchange || 'NSE',
      category: row.category || 'BENCHMARK',
      is_fno: row.is_fno ?? true,
      lot_size: row.lot_size ?? 25,
      benchmark_price: row.benchmark_price !== null && row.benchmark_price !== undefined ? row.benchmark_price : '',
      is_active: row.is_active ?? true
    })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.symbol.trim() || !form.name.trim()) return
    setSaving(true)
    try {
      const body = {
        ...form,
        symbol: form.symbol.trim().toUpperCase(),
        name: form.name.trim(),
        category: form.category.trim().toUpperCase(),
        lot_size: parseInt(form.lot_size) || 0,
        benchmark_price: form.benchmark_price !== '' ? parseFloat(form.benchmark_price) : null
      }
      if (editing) {
        await api.indices.update(editing.symbol, body, dataset)
        show('Index updated')
      } else {
        await api.indices.create(body, dataset)
        show('Index created')
      }
      setShowForm(false)
      load()
    } catch (e) { show(e.message, 'error') }
    finally { setSaving(false) }
  }

  const del = async symbol => {
    try {
      await api.indices.remove(symbol, dataset)
      show('Index deleted')
      load()
    } catch (e) { show(e.message, 'error') }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setImportResult(null)
  }

  const runImport = async () => {
    if (!selectedFile) return
    setImporting(true)
    setImportResult(null)
    try {
      const res = await api.indices.uploadCSV(selectedFile, dataset)
      setImportResult(res)
      show(`Successfully processed ${selectedFile.name}`, 'success')
      load()
    } catch (e) {
      show(e.message, 'error')
    } finally {
      setImporting(false)
    }
  }

  const SortTh = ({ k, children }) => (
    <th onClick={() => sort(k)} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {children}{sortKey === k && (sortAsc ? ' ↑' : ' ↓')}
    </th>
  )

  return (
    <div className="master-page">
      {ToastContainer}
      <SectionHeader
        title="Indices Master"
        sub={`${filtered.length} of ${rows.length} market indices`}
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              className="btn-secondary"
              onClick={() => { setSelectedFile(null); setImportResult(null); setShowImport(true) }}
            >
              <Upload size={14}/> Upload CSV
            </button>
            <button
              className="btn-secondary"
              onClick={downloadCSV}
            >
              <Download size={14}/> Download CSV
            </button>
            <button className="btn-primary" onClick={openNew}><Plus size={14}/> Add Index</button>
          </div>
        }
      />

      {/* Toolbar */}
      <div className="ticker-toolbar">
        <SearchBar
          value={search}
          onChange={v => { setSearch(v); setPage(1) }}
          placeholder="Search index symbol or name…"
        />
        <div className="filter-row">
          <Select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1) }} style={{ width: 160 }}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select value={filterFno} onChange={e => { setFilterFno(e.target.value); setPage(1) }} style={{ width: 130 }}>
            <option value="">All Segment Types</option>
            <option value="true">F&amp;O Traded</option>
            <option value="false">Cash/Sectoral</option>
          </Select>
          {(search || filterCategory || filterFno) && (
            <button className="btn-ghost sm" onClick={() => { setSearch(''); setFilterCategory(''); setFilterFno(''); setPage(1) }}>
              <X size={12}/> Clear
            </button>
          )}
        </div>
      </div>

      <section className="panel data-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <SortTh k="symbol">Symbol</SortTh>
                <SortTh k="name">Index Name</SortTh>
                <SortTh k="category">Category</SortTh>
                <SortTh k="exchange">Exchange</SortTh>
                <SortTh k="lot_size">Lot Size</SortTh>
                <SortTh k="benchmark_price">Benchmark Price</SortTh>
                <SortTh k="is_fno">F&amp;O Status</SortTh>
                <th style={{ width: 90, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8}><div className="state">Loading market indices…</div></td></tr>}
              {!loading && paged.length === 0 && (
                <tr><td colSpan={8}><div className="state">No indices match your query.</div></td></tr>
              )}
              {!loading && paged.map(row => (
                <tr key={row.symbol} className="data-row">
                  <td><b style={{ color: '#7ec8f0', fontFamily: "'DM Mono'" }}>{row.symbol}</b></td>
                  <td>
                    <span style={{ color: '#e2e8f0', fontWeight: 500 }}>
                      {row.name || '—'}
                    </span>
                  </td>
                  <td><span className="index-chip">{row.category || 'BENCHMARK'}</span></td>
                  <td><span className="badge neutral">{row.exchange || 'NSE'}</span></td>
                  <td><span style={{ fontFamily: "'DM Mono'", color: '#cbd5e1' }}>{row.lot_size ? `${row.lot_size}` : '—'}</span></td>
                  <td>
                    <span style={{ fontFamily: "'DM Mono'", color: '#7ec8f0', fontWeight: 600 }}>
                      {row.benchmark_price ? `₹${row.benchmark_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                    </span>
                  </td>
                  <td><FnoBadge value={row.is_fno}/></td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="row-actions">
                      <button className="icon-btn sm" title="Edit" onClick={() => openEdit(row)}><Edit2 size={13}/></button>
                      <button className="icon-btn sm danger" title="Delete" onClick={() => setConfirm(row)}><Trash2 size={13}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onChange={setPage}/>
      </section>

      {/* Form Modal */}
      {showForm && (
        <Modal
          title={editing ? `Edit Index "${editing.symbol}"` : 'Add New Index'}
          subtitle={editing ? editing.name : 'Enter index master specifications'}
          onClose={() => setShowForm(false)}
        >
          <div className="form-grid2">
            <FormGroup label="Index Symbol" required>
              <Input
                value={form.symbol}
                disabled={!!editing}
                onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                placeholder="e.g. NIFTY, BANKNIFTY"
              />
            </FormGroup>
            <FormGroup label="Exchange">
              <Select value={form.exchange} onChange={e => setForm(f => ({ ...f, exchange: e.target.value }))}>
                <option>NSE</option>
                <option>BSE</option>
              </Select>
            </FormGroup>
          </div>

          <FormGroup label="Index Full Name" required>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Nifty 50 Index"
            />
          </FormGroup>

          <div className="form-grid2">
            <FormGroup label="Category">
              <Select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value.toUpperCase() }))}>
                <option value="BENCHMARK">BENCHMARK</option>
                <option value="SECTORAL">SECTORAL</option>
                <option value="THEMATIC">THEMATIC</option>
                <option value="STRATEGY">STRATEGY</option>
              </Select>
            </FormGroup>
            <FormGroup label="F&O Derivative Lot Size">
              <Input
                type="number"
                value={form.lot_size}
                onChange={e => setForm(f => ({ ...f, lot_size: e.target.value }))}
                placeholder="e.g. 25, 15, 50"
              />
            </FormGroup>
          </div>

          <FormGroup label="Benchmark Reference Price (₹)" hint="optional">
            <Input
              type="number"
              step="0.01"
              value={form.benchmark_price}
              onChange={e => setForm(f => ({ ...f, benchmark_price: e.target.value }))}
              placeholder="e.g. 24175.65"
            />
          </FormGroup>

          <div style={{ display: 'flex', gap: 20, marginTop: 10 }}>
            <Checkbox
              label="F&O Segment Traded"
              checked={form.is_fno}
              onChange={e => setForm(f => ({ ...f, is_fno: e.target.checked }))}
            />
            <Checkbox
              label="Active Status"
              checked={form.is_active}
              onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
            />
          </div>

          <div className="form-actions">
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving || !form.symbol.trim() || !form.name.trim()}>
              {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
            </button>
          </div>
        </Modal>
      )}

      {/* CSV Import Modal */}
      {showImport && (
        <Modal
          title="Upload Indices Master CSV"
          subtitle="Upload indices_master.csv or text list containing index symbols"
          onClose={() => setShowImport(false)}
          size="sm"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FormGroup label="Select CSV or TXT file" required hint="Supported: indices_master.csv, symbol list">
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileSelect}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: 13,
                  background: 'var(--panel-bg, #1e293b)',
                  border: '1px solid var(--border-color, #334155)',
                  borderRadius: 6,
                  color: '#e2e8f0',
                  cursor: 'pointer'
                }}
              />
            </FormGroup>

            {selectedFile && (
              <div style={{
                padding: 12,
                background: 'rgba(126, 200, 240, 0.08)',
                border: '1px solid rgba(126, 200, 240, 0.2)',
                borderRadius: 6,
                fontSize: 13
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: '#7ec8f0' }}>
                  <FileText size={16}/> {selectedFile.name}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  Size: {(selectedFile.size / 1024).toFixed(1)} KB · Ready to ingest into indices_master
                </div>
              </div>
            )}

            {importResult && (
              <div style={{
                padding: 12,
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                borderRadius: 6,
                fontSize: 13
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#4ade80', marginBottom: 6 }}>
                  <CheckCircle2 size={16}/> Ingestion Complete
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12, color: '#cbd5e1' }}>
                  <div><strong>Total Entries:</strong> {importResult.total_records}</div>
                  <div><strong>New Added:</strong> {importResult.new_indices_count}</div>
                  <div><strong>Existing Updated:</strong> {importResult.updated_indices_count}</div>
                </div>
                {importResult.indices && importResult.indices.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#4ade80', textTransform: 'uppercase', marginBottom: 4 }}>
                      Parsed Indices ({importResult.indices.length}):
                    </div>
                    <div className="chip-wrap" style={{ maxHeight: 100, overflowY: 'auto' }}>
                      {importResult.indices.map(i => (
                        <span key={i} className="index-chip" style={{ fontSize: 11 }}>{i}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="form-actions" style={{ marginTop: 20 }}>
            <button className="btn-ghost" onClick={() => setShowImport(false)}>
              {importResult ? 'Close' : 'Cancel'}
            </button>
            <button
              className="btn-primary"
              onClick={runImport}
              disabled={importing || !selectedFile}
            >
              {importing ? 'Processing…' : 'Upload & Seed Indices Master'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {confirm && (
        <ConfirmDialog
          title="Delete Index?"
          message={`"${confirm.symbol}" (${confirm.name}) will be removed from indices_master.`}
          onConfirm={() => del(confirm.symbol)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
