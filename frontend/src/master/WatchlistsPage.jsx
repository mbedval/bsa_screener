import React, { useEffect, useMemo, useState } from 'react'
import { BookMarked, Edit2, Plus, Trash2, Check, X, AlertCircle } from 'lucide-react'
import * as api from './api.js'
import {
  useToast, Modal, ConfirmDialog, Pagination, SectionHeader, SearchBar,
  CountBadge, TickerChip
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
  const [saving, setSaving]         = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const { show, ToastContainer }    = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const w = await api.watchlists.list()
      setWatchlists(w)
    } catch (e) { show(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() =>
    watchlists.filter(w => !search || w.name.toLowerCase().includes(search.toLowerCase()) || (w.description || '').toLowerCase().includes(search.toLowerCase())),
    [watchlists, search]
  )
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ── Open Excel-like Editor ──────────────────────────────────────────────────
  const openEditor = (w) => {
    setErrorMsg('')
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

      // Save tickers
      await api.watchlists.setTickers(wlId, parsedTickers)
      show(editingWl.id ? 'Watchlist updated successfully' : 'Watchlist created successfully')
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
        actions={<button className="btn-primary" onClick={() => openEditor(null)}><Plus size={14}/> Create Watchlist</button>}
      />

      <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search watchlist by name or description…"/>

      <section className="panel data-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Watchlist Name</th>
                <th>Count</th>
                <th>Sectors / Scope</th>
                <th style={{ width: 90 }}/>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4}><div className="state">Loading watchlists…</div></td></tr>}
              {!loading && paged.length === 0 && (
                <tr><td colSpan={4}><div className="state">No watchlists found.</div></td></tr>
              )}
              {!loading && paged.map(w => (
                <tr key={w.id} className="data-row">
                  <td>
                    <b style={{ color: '#7ec8f0', fontFamily: "'DM Mono'", display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <BookMarked size={13} style={{ color: '#4e8bff' }}/>
                      {w.name}
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
              <div className="form-group" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
    </div>
  )
}
