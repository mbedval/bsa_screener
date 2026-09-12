import React, { useEffect, useMemo, useState } from 'react'
import { Edit2, Tag, Plus, Trash2, ChevronDown, ChevronRight, Globe, Upload, Download, FileText, CheckCircle2 } from 'lucide-react'
import * as api from './api.js'
import {
  useToast, Modal, ConfirmDialog, DataTable, Pagination,
  SectionHeader, SearchBar, FormGroup, Input, Textarea,
  SectorChip, TickerChip, CountBadge, EmptyState, FnoBadge
} from './ui.jsx'

const PAGE_SIZE = 10

export default function SectorsPage({ dataset }) {
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [expanded, setExpanded] = useState(null)  // sector id that is expanded
  const [sectorTickers, setSectorTickers] = useState({}) // id → tickers[]
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState(null)
  const [confirm, setConfirm]   = useState(null)
  const [saving, setSaving]     = useState(false)
  const [form, setForm]         = useState({ name: '', description: '' })
  
  // File Import State
  const [showImport, setShowImport] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [customSector, setCustomSector] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)

  const { show, ToastContainer } = useToast()

  const load = async () => {
    setLoading(true)
    try { setRows(await api.sectors.list(dataset)) }
    catch (e) { show(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [dataset])

  const downloadCSV = () => {
    if (!rows || rows.length === 0) {
      show('No sectors available to download', 'error')
      return
    }
    const headers = ['id', 'name', 'description', 'ticker_count']
    const csvLines = [headers.join(',')]
    rows.forEach(r => {
      const row = [
        r.id ?? '',
        `"${(r.name || '').replace(/"/g, '""')}"`,
        `"${(r.description || '').replace(/"/g, '""')}"`,
        r.ticker_count ?? 0
      ]
      csvLines.push(row.join(','))
    })
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `sectors_master_${dataset || 'default'}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    show('Sectors master CSV downloaded', 'success')
  }

  const [sortKey, setSortKey] = useState('')
  const [sortAsc, setSortAsc] = useState(true)

  const handleSort = key => {
    setSortAsc(k => sortKey === key ? !sortAsc : true)
    setSortKey(key)
    setPage(1)
  }

  const filtered = useMemo(() => {
    let list = rows.filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()))
    if (sortKey) {
      list = [...list].sort((a, b) => {
        const valA = a[sortKey] ?? ''
        const valB = b[sortKey] ?? ''
        if (typeof valA === 'number' && typeof valB === 'number') {
          return (valA - valB) * (sortAsc ? 1 : -1)
        }
        return String(valA).localeCompare(String(valB), undefined, { numeric: true }) * (sortAsc ? 1 : -1)
      })
    }
    return list
  }, [rows, search, sortKey, sortAsc])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const openNew  = () => { setEditing(null); setForm({ name: '', description: '' }); setShowForm(true) }
  const openEdit = r  => { setEditing(r);    setForm({ name: r.name, description: r.description || '' }); setShowForm(true) }

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editing) { await api.sectors.update(editing.id, form); show('Sector updated') }
      else         { await api.sectors.create(form);              show('Sector created') }
      setShowForm(false); load()
    } catch (e) { show(e.message, 'error') }
    finally { setSaving(false) }
  }

  const del = async id => {
    try { await api.sectors.remove(id); show('Sector deleted'); load() }
    catch (e) { show(e.message, 'error') }
  }

  const toggleExpand = async (row) => {
    if (expanded === row.id) { setExpanded(null); return }
    setExpanded(row.id)
    if (!sectorTickers[row.id]) {
      try {
        const t = await api.sectors.tickers(row.id)
        setSectorTickers(m => ({ ...m, [row.id]: t }))
      } catch (e) { show(e.message, 'error') }
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setImportResult(null)
    
    // Auto infer sector name for custom field display helper
    let name = file.name.replace(/\.[^/.]+$/, "")
    if (name.toLowerCase().startsWith("watchlist_")) {
      name = name.slice(10)
    } else if (name.toLowerCase().startsWith("watchlist")) {
      name = name.slice(9)
    }
    name = name.replace(/[_-]+/g, ' ').trim()
    if (name) {
      const words = name.split(' ')
      const formatted = words.map(w => ['it', 'fno', 'bse', 'nse', 'fmcg'].includes(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      setCustomSector(formatted)
    } else {
      setCustomSector('')
    }
  }

  const runImport = async () => {
    if (!selectedFile) return
    setImporting(true)
    setImportResult(null)
    try {
      const res = await api.sectors.importFile(selectedFile, customSector)
      setImportResult(res)
      show(`Successfully processed ${selectedFile.name}`, 'success')
      load()
    } catch (e) {
      show(e.message, 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="master-page">
      {ToastContainer}
      <SectionHeader
        title="Sectors"
        sub={`${filtered.length} sector${filtered.length !== 1 ? 's' : ''} · click a row to see its tickers`}
        actions={
          <button className="btn-primary" onClick={openNew}>
            <Plus size={14}/> Add Sector
          </button>
        }
      />

      <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search by name…">
        <button
          className="btn-secondary"
          onClick={() => { setSelectedFile(null); setImportResult(null); setCustomSector(''); setShowImport(true) }}
          style={{ whiteSpace: 'nowrap' }}
        >
          <Upload size={14}/> Import Watchlist File
        </button>
        <button
          className="btn-secondary"
          onClick={downloadCSV}
          style={{ whiteSpace: 'nowrap' }}
        >
          <Download size={14}/> Download CSV
        </button>
      </SearchBar>

      <section className="panel data-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{width:32}}/>
                <th onClick={() => handleSort('name')} style={{cursor:'pointer'}}>Sector name {sortKey === 'name' && (sortAsc ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('description')} style={{cursor:'pointer'}}>Description {sortKey === 'description' && (sortAsc ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('ticker_count')} style={{cursor:'pointer'}}>Tickers {sortKey === 'ticker_count' && (sortAsc ? '↑' : '↓')}</th>
                <th style={{width:80}}/>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5}><div className="state">Loading…</div></td></tr>}
              {!loading && paged.length === 0 && (
                <tr><td colSpan={5}><div className="state">No sectors found.</div></td></tr>
              )}
              {!loading && paged.map(row => (
                <React.Fragment key={row.id}>
                  <tr className="data-row">
                    <td onClick={() => toggleExpand(row)} style={{cursor:'pointer', width:32, textAlign:'center'}}>
                      <button className="icon-btn sm" onClick={() => toggleExpand(row)}>
                        {expanded === row.id ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
                      </button>
                    </td>
                    <td><span style={{fontWeight:700, color:'#d9eaff'}}><Tag size={12} style={{marginRight:5, verticalAlign:'middle'}}/>{row.name}</span></td>
                    <td style={{color:'#7090b0', fontSize:12}}>{row.description || '—'}</td>
                    <td><CountBadge count={row.ticker_count ?? '?'}/></td>
                    <td>
                      <div className="row-actions">
                        <button className="icon-btn sm" title="Edit" onClick={() => openEdit(row)}><Edit2 size={13}/></button>
                        <button className="icon-btn sm danger" title="Delete" onClick={() => setConfirm(row)}><Trash2 size={13}/></button>
                      </div>
                    </td>
                  </tr>
                  {expanded === row.id && (
                    <tr className="expanded-row">
                      <td/>
                      <td colSpan={4}>
                        <div className="expanded-content">
                          <p className="eyebrow" style={{marginBottom:10}}>TICKERS IN {row.name.toUpperCase()}</p>
                          {!sectorTickers[row.id]
                            ? <div style={{color:'#5a7a9a', fontSize:12}}>Loading tickers…</div>
                            : sectorTickers[row.id].length === 0
                              ? <div style={{color:'#5a7a9a', fontSize:12}}>No tickers mapped to this sector yet.</div>
                              : <div className="chip-wrap">
                                  {sectorTickers[row.id].map(t => (
                                    <span key={t.ticker} className="ticker-chip" title={t.company_name}>
                                      {t.ticker}
                                      {t.is_fno && <span className="fno-dot" title="F&O"/>}
                                    </span>
                                  ))}
                                </div>
                          }
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onChange={setPage}/>
      </section>

      {/* Import Watchlist Sector File Modal */}
      {showImport && (
        <Modal title="Import Watchlist Sector File" onClose={() => setShowImport(false)} size="md">
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px 0' }}>
              Select a text file containing tickers. File naming convention: <code>watchlist_&lt;sector&gt;.txt</code> (e.g. <code>watchlist_pharma.txt</code>).
            </p>

            <FormGroup label="Select TXT File" required>
              <Input
                type="file"
                accept=".txt,.csv"
                onChange={handleFileSelect}
                style={{ padding: '6px 12px' }}
              />
            </FormGroup>

            {selectedFile && (
              <FormGroup label="Sector Name (Inferred from filename)" hint="You can override the target sector name below">
                <Input
                  value={customSector}
                  onChange={e => setCustomSector(e.target.value)}
                  placeholder="e.g. Pharma, IT Services"
                />
              </FormGroup>
            )}

            {importResult && (
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 6,
                padding: 14,
                marginTop: 16,
                fontSize: 13,
                color: '#166534'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
                  <CheckCircle2 size={16} color="#16a34a" /> Import Completed Successfully
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                  <div><strong>Target Sector:</strong> {importResult.sector_name}</div>
                  <div><strong>Total Tickers:</strong> {importResult.total_tickers}</div>
                  <div><strong>New Tickers Created:</strong> {importResult.new_tickers_added_count}</div>
                  <div><strong>Existing Tickers Mapped:</strong> {importResult.new_mappings_count}</div>
                  <div><strong>Already Mapped:</strong> {importResult.already_mapped_count}</div>
                </div>
                {importResult.tickers && importResult.tickers.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#15803d', textTransform: 'uppercase', marginBottom: 4 }}>
                      Parsed Tickers:
                    </div>
                    <div className="chip-wrap" style={{ maxHeight: 100, overflowY: 'auto' }}>
                      {importResult.tickers.map(t => (
                        <span key={t} className="ticker-chip" style={{ fontSize: 11 }}>{t}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="form-actions">
            <button className="btn-ghost" onClick={() => setShowImport(false)}>
              {importResult ? 'Close' : 'Cancel'}
            </button>
            <button
              className="btn-primary"
              onClick={runImport}
              disabled={importing || !selectedFile}
            >
              {importing ? 'Processing…' : 'Upload & Seed Master Data'}
            </button>
          </div>
        </Modal>
      )}

      {/* Add / Edit modal */}
      {showForm && (
        <Modal title={editing ? `Edit "${editing.name}"` : 'New Sector'} onClose={() => setShowForm(false)} size="sm">
          <FormGroup label="Sector name" required>
            <Input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="e.g. Nifty IT"/>
          </FormGroup>
          <FormGroup label="Description" hint="optional">
            <Textarea rows={2} value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Brief description of this sector"/>
          </FormGroup>
          <div className="form-actions">
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {confirm && (
        <ConfirmDialog
          title="Delete sector?"
          message={`"${confirm.name}" will be removed and all its ticker mappings will be lost.`}
          onConfirm={() => del(confirm.id)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
