import React, { useEffect, useMemo, useState } from 'react'
import { BookMarked, Edit2, Plus, Trash2, Check, X, AlertCircle, Upload, Download } from 'lucide-react'
import * as api from './api.js'
import {
  useToast, Modal, ConfirmDialog, Pagination, SectionHeader, SearchBar,
  CountBadge, TickerChip, TruncatedCellText, FormGroup
} from './ui.jsx'

const PAGE_SIZE = 25

export default function WatchlistsPage() {
  const [watchlists, setWatchlists] = useState([])
  const [loading, setLoading]       = useState(true)
  const [page, setPage]             = useState(1)
  const [search, setSearch]         = useState('')
  const [editingWl, setEditingWl]   = useState(null) // watchlist object being edited
  const [editName, setEditName]     = useState('')
  const [editDesc, setEditDesc]     = useState('')
  const [rawTickers, setRawTickers] = useState('')   // Textarea string (one per line or comma separated)
  const [errorMsg, setErrorMsg]     = useState('')
  const [confirmDel, setConfirmDel] = useState(null)
  const [confirmBatch, setConfirmBatch] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [saving, setSaving]         = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [masterTickers, setMasterTickers] = useState([])
  const [tickerQuery, setTickerQuery]     = useState('')
  const [selectedFoundTicker, setSelectedFoundTicker] = useState('')
  const [showImport, setShowImport]   = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading]     = useState(false)
  const [importResult, setImportResult] = useState(null)
  const { show, ToastContainer }    = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const [w, tList] = await Promise.all([
        api.watchlists.list(),
        api.tickers.list({})
      ])
      setWatchlists(w)
      setMasterTickers(tList || [])
    } catch (e) { show(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() =>
    watchlists.filter(w => !search || w.name.toLowerCase().includes(search.toLowerCase()) || (w.description || '').toLowerCase().includes(search.toLowerCase())),
    [watchlists, search]
  )
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const allPagedSelected = paged.length > 0 && paged.every(w => selectedIds.has(w.id))

  const toggleSelectAllPaged = () => {
    const next = new Set(selectedIds)
    if (allPagedSelected) {
      paged.forEach(w => next.delete(w.id))
    } else {
      paged.forEach(w => next.add(w.id))
    }
    setSelectedIds(next)
  }

  const toggleSelect = id => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const downloadCSV = async () => {
    try {
      await api.watchlists.downloadCSV()
      show('Watchlists downloaded successfully', 'success')
    } catch (e) {
      show('Failed to download watchlists: ' + e.message, 'error')
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return
    setUploading(true)
    setImportResult(null)
    try {
      const res = await api.watchlists.uploadCSV(selectedFile)
      setImportResult({ success: true, msg: res.message })
      await load()
    } catch (e) {
      setImportResult({ success: false, msg: e.message })
    } finally {
      setUploading(false)
    }
  }

  // ── Open Excel-like Editor ──────────────────────────────────────────────────
  const openEditor = (w) => {
    setErrorMsg('')
    setTickerQuery('')
    setSelectedFoundTicker('')
    if (w) {
      setEditingWl(w)
      setEditName(w.name)
      setEditDesc(w.description || '')
      setRawTickers((w.tickers || []).join('\n'))
    } else {
      setEditingWl({ id: null })
      setEditName('')
      setEditDesc('')
      setRawTickers('')
    }
    setShowCreate(true)
  }

  const closeEditor = () => {
    setShowCreate(false)
    setEditingWl(null)
    setErrorMsg('')
    setTickerQuery('')
    setSelectedFoundTicker('')
  }

  // ── Save Watchlist + Tickers in Excel Editor ─────────────────────────────
  const saveWatchlist = async () => {
    setErrorMsg('')
    const trimmedName = editName.trim()
    if (!trimmedName) {
      setErrorMsg('Watchlist name is required and cannot be empty.')
      return
    }

    setSaving(true)
    try {
      let wlId = editingWl.id
      if (wlId) {
        // Update name / desc
        await api.watchlists.update(wlId, { name: trimmedName, description: editDesc })
      } else {
        // Create new
        const created = await api.watchlists.create({ name: trimmedName, description: editDesc })
        wlId = created.id
      }

      // Parse text tickers (supports line breaks, commas, spaces)
      const parsedTickers = Array.from(new Set(
        rawTickers
          .split(/[\n,\s]+/)
          .map(t => t.trim().toUpperCase())
          .filter(Boolean)
      ))

      // Save tickers — backend validates against ticker_master
      const result = await api.watchlists.setTickers(wlId, parsedTickers)

      if (result.skipped_count > 0) {
        const baseMsg = editingWl.id ? 'Watchlist updated' : 'Watchlist created'
        show(`${baseMsg} — ${result.saved_count} ticker(s) saved. ⚠️ ${result.skipped_count} unrecognised ticker(s) skipped: ${result.skipped.join(', ')}`)
      } else {
        show(editingWl.id ? 'Watchlist updated successfully' : 'Watchlist created successfully')
      }
      closeEditor()
      load()
    } catch (e) {
      setErrorMsg(e.message || 'Failed to save watchlist.')
    } finally {
      setSaving(false)
    }
  }


  // ── Permanent Deletion (No soft delete) ───────────────────────────────────
  const handleDelete = async (w) => {
    try {
      await api.watchlists.remove(w.id)
      show(`Watchlist "${w.name}" deleted permanently from all references.`)
      setConfirmDel(null)
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.delete(w.id)
        return next
      })
      load()
    } catch (e) {
      show(e.message, 'error')
    }
  }

  const handleBatchDelete = async () => {
    try {
      const ids = Array.from(selectedIds)
      const res = await api.watchlists.removeBatch(ids)
      show(`Permanently deleted ${res.deleted_count || ids.length} watchlists and updated all references.`)
      setSelectedIds(new Set())
      setConfirmBatch(false)
      load()
    } catch (e) {
      show(e.message, 'error')
    }
  }

  return (
    <div className="master-page">
      {ToastContainer}
      <SectionHeader
        title="Watchlists"
        sub={`${filtered.length} watchlist${filtered.length !== 1 ? 's' : ''} available`}
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {selectedIds.size > 0 && (
              <button className="btn-danger" onClick={() => setConfirmBatch(true)}>
                <Trash2 size={14}/> Delete Selected ({selectedIds.size})
              </button>
            )}
            <button className="btn-secondary" onClick={downloadCSV} title="Download watchlists as CSV">
              <Download size={14}/> Download CSV
            </button>
            <button
              className="btn-secondary"
              onClick={() => { setSelectedFile(null); setImportResult(null); setShowImport(true) }}
            >
              <Upload size={14}/> Upload CSV
            </button>
            <button className="btn-primary" onClick={() => openEditor(null)}><Plus size={14}/> Create Watchlist</button>
          </div>
        }
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search watchlist by name or description…"/>
        {selectedIds.size > 0 && (
          <span style={{ fontSize: 13, color: '#7ec8f0' }}>
            {selectedIds.size} watchlist{selectedIds.size > 1 ? 's' : ''} selected
            <button className="btn-ghost sm" onClick={() => setSelectedIds(new Set())} style={{ marginLeft: 8 }}>Deselect all</button>
          </span>
        )}
      </div>

      <section className="panel data-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={allPagedSelected}
                    onChange={toggleSelectAllPaged}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th>Watchlist Name</th>
                <th>Count</th>
                <th>Sectors / Scope</th>
                <th style={{ width: 90 }}/>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5}><div className="state">Loading watchlists…</div></td></tr>}
              {!loading && paged.length === 0 && (
                <tr><td colSpan={5}><div className="state">No watchlists found.</div></td></tr>
              )}
              {!loading && paged.map(w => (
                <tr key={w.id} className={`data-row ${selectedIds.has(w.id) ? 'selected-row' : ''}`}>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(w.id)}
                      onChange={() => toggleSelect(w.id)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td>
                    <b style={{ color: '#7ec8f0', fontFamily: "'DM Mono'", display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <BookMarked size={13} style={{ color: '#4e8bff', flexShrink: 0 }}/>
                      <TruncatedCellText text={w.name} title="Watchlist Name" maxLen={20} truncLen={16} />
                    </b>
                  </td>
                  <td><CountBadge count={(w.tickers || []).length}/></td>
                  <td style={{ color: '#7090b0', fontSize: 11 }}>
                    {(w.tickers || []).length > 0 ? (
                      <span className="chip-wrap sm">
                        {(w.tickers || []).slice(0, 4).map(t => <TickerChip key={t} label={t}/>)}
                        {(w.tickers || []).length > 4 && <span style={{ color: '#5a7a9a', fontSize: 10 }}>+{(w.tickers || []).length - 4} more</span>}
                      </span>
                    ) : (
                      <span style={{ color: '#4a6a8a' }}>—</span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn sm" title="Edit watchlist" onClick={() => openEditor(w)}><Edit2 size={13}/></button>
                      <button className="icon-btn sm danger" title="Delete permanently" onClick={() => setConfirmDel(w)}><Trash2 size={13}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onChange={setPage}/>
      </section>


      {/* Excel-like Simple Grid Editor Modal */}
      {showCreate && (
        <Modal
          title={editingWl?.id ? `Edit Watchlist: ${editingWl.name}` : 'Create New Watchlist'}
          subtitle="Simple grid editor — enter list details and ticker symbols directly"
          onClose={closeEditor}
          size="lg"
        >
          {errorMsg && (
            <div className="error-banner" style={{ background: '#3a1e2e', border: '1px solid #7a3050', color: '#ff93a8', padding: '10px 14px', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <AlertCircle size={16}/>
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="excel-editor-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="excel-meta-col">
              <div className="form-group">
                <label>Watchlist Name <span className="req">*</span></label>
                <input
                  className="form-input"
                  value={editName}
                  onChange={e => { setEditName(e.target.value); setErrorMsg('') }}
                  placeholder="e.g. NIFTY IT, HIGH VOLATILE"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>Description <small style={{ color: '#5a7a9a' }}>(optional)</small></label>
                <textarea
                  className="form-input"
                  rows={4}
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  placeholder="Brief note or summary about this watchlist..."
                />
              </div>

              <div className="editor-info-box" style={{ background: '#0a1727', border: '1px solid #1e3550', padding: 12, borderRadius: 8, fontSize: 12, color: '#7090b0', marginTop: 12 }}>
                <b style={{ color: '#d9eaff', display: 'block', marginBottom: 4 }}>💡 Grid Input Tips:</b>
                Paste or type stock symbols in the list box on the right. You can separate tickers by newlines, commas, or spaces.
              </div>
            </div>

            <div className="excel-tickers-col">
              {/* Ticker Search & Select Helper Box */}
              <div className="form-group" style={{ marginBottom: 12, background: '#0a1727', border: '1px solid #1e3550', padding: 10, borderRadius: 8 }}>
                <label style={{ color: '#7ec8f0', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
                  🔍 Lookup Ticker Master Name
                </label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input
                    className="form-input"
                    style={{ flex: 1, fontSize: 12 }}
                    placeholder="Search by Ticker or Company Name (e.g. Reliance)..."
                    value={tickerQuery}
                    onChange={e => { setTickerQuery(e.target.value); setSelectedFoundTicker(''); }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    className="form-input"
                    style={{ flex: 1, fontSize: 12 }}
                    value={selectedFoundTicker}
                    onChange={e => setSelectedFoundTicker(e.target.value)}
                  >
                    {(() => {
                      const q = tickerQuery.trim().toLowerCase()
                      const matches = masterTickers.filter(t => !q || (t.ticker || '').toLowerCase().includes(q) || (t.company_name || '').toLowerCase().includes(q))
                      return (
                        <>
                          <option value="">-- {matches.length} Matched Ticker Master Records --</option>
                          {matches.slice(0, 100).map(t => (
                            <option key={t.ticker} value={t.ticker}>{t.ticker} — {t.company_name}</option>
                          ))}
                        </>
                      )
                    })()}
                  </select>
                  <button
                    className="btn-secondary sm"
                    type="button"
                    disabled={!selectedFoundTicker}
                    onClick={() => {
                      if (!selectedFoundTicker) return
                      const existing = rawTickers.split(/[\n,\s]+/).map(t => t.trim().toUpperCase()).filter(Boolean)
                      if (!existing.includes(selectedFoundTicker)) {
                        setRawTickers(prev => (prev ? prev.trim() + '\n' + selectedFoundTicker : selectedFoundTicker))
                      }
                      setSelectedFoundTicker('')
                    }}
                  >
                    + Add
                  </button>
                </div>
              </div>

              <div className="form-group" style={{ height: 'calc(100% - 90px)', display: 'flex', flexDirection: 'column' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Tickers Grid (Text / Excel List)</span>
                  <span style={{ color: '#4e8bff', font: '700 11px "DM Mono"' }}>
                    {Array.from(new Set(rawTickers.split(/[\n,\s]+/).map(t => t.trim()).filter(Boolean))).length} Tickers
                  </span>
                </label>
                <textarea
                  className="form-input excel-textarea"
                  style={{
                    flex: 1,
                    minHeight: 220,
                    fontFamily: "'DM Mono', monospace",
                    fontSize: 13,
                    lineHeight: 1.6,
                    background: '#071220',
                    border: '1px solid #233d5d',
                    color: '#6fd8cb'
                  }}
                  value={rawTickers}
                  onChange={e => setRawTickers(e.target.value)}
                  placeholder={"RELIANCE\nTCS\nINFY\nHDFCBANK\nCOFORGE"}
                />
              </div>
            </div>
          </div>

          <div className="form-actions" style={{ marginTop: 20 }}>
            <button className="btn-ghost" onClick={closeEditor}>Cancel</button>
            <button className="btn-primary" onClick={saveWatchlist} disabled={saving}>
              {saving ? 'Saving…' : 'Save Watchlist'}
            </button>
          </div>
        </Modal>
      )}

      {/* Hard Delete Confirmation */}
      {confirmDel && (
        <ConfirmDialog
          title="Permanently Delete Watchlist?"
          message={`Are you sure you want to permanently delete "${confirmDel.name}"? This action CANNOT be undone and will remove it from all database references.`}
          confirmLabel="Delete Permanently"
          onConfirm={() => handleDelete(confirmDel)}
          onClose={() => setConfirmDel(null)}
        />
      )}

      {/* Batch Delete Confirmation */}
      {confirmBatch && (
        <ConfirmDialog
          title={`Permanently Delete ${selectedIds.size} Watchlists?`}
          message={`Are you sure you want to permanently delete ${selectedIds.size} selected watchlists? This action CANNOT be undone and will remove them from all user & ticker mappings.`}
          confirmLabel={`Delete ${selectedIds.size} Permanently`}
          onConfirm={handleBatchDelete}
          onClose={() => setConfirmBatch(false)}
        />
      )}
      {/* Upload CSV modal */}
      {showImport && (
        <Modal
          title="Upload Watchlists CSV"
          subtitle="Upload watchlists.csv containing Watchlist Name, Description, and Ticker columns"
          onClose={() => setShowImport(false)}
          size="sm"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FormGroup label="Select CSV file" required hint="Supported: watchlists.csv">
              <input
                type="file"
                accept=".csv"
                onChange={e => {
                  setSelectedFile(e.target.files?.[0] || null)
                  setImportResult(null)
                }}
                className="form-input"
                style={{ padding: '8px' }}
              />
            </FormGroup>

            {importResult && (
              <div style={{
                padding: 12, borderRadius: 8, fontSize: 13,
                background: importResult.success ? 'rgba(52,211,153,0.1)' : 'rgba(248,113,113,0.1)',
                color: importResult.success ? '#34d399' : '#f87171',
                border: `1px solid ${importResult.success ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)'}`
              }}>
                {importResult.msg}
              </div>
            )}

            <div className="form-actions" style={{ marginTop: 8 }}>
              <button className="btn-ghost" onClick={() => setShowImport(false)}>Close</button>
              <button
                className="btn-primary"
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
              >
                {uploading ? 'Uploading…' : 'Upload & Import'}
              </button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  )
}
