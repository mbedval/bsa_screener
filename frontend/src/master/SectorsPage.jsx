import React, { useEffect, useMemo, useState } from 'react'
import { Edit2, Tag, Plus, Trash2, ChevronDown, ChevronRight, Globe } from 'lucide-react'
import * as api from './api.js'
import {
  useToast, Modal, ConfirmDialog, DataTable, Pagination,
  SectionHeader, SearchBar, FormGroup, Input, Textarea,
  SectorChip, TickerChip, CountBadge, EmptyState, FnoBadge
} from './ui.jsx'

const PAGE_SIZE = 10

export default function SectorsPage() {
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
  const { show, ToastContainer } = useToast()

  const load = async () => {
    setLoading(true)
    try { setRows(await api.sectors.list()) }
    catch (e) { show(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

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

  return (
    <div className="master-page">
      {ToastContainer}
      <SectionHeader
        title="Sectors"
        sub={`${filtered.length} sector${filtered.length !== 1 ? 's' : ''} · click a row to see its tickers`}
        actions={<button className="btn-primary" onClick={openNew}><Plus size={14}/> Add Sector</button>}
      />

      <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search by name…"/>

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
              {!loading && paged.map(row => [
                <tr key={row.id} className="data-row">
                  <td>
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
                </tr>,
                expanded === row.id && (
                  <tr key={`exp-${row.id}`} className="expanded-row">
                    <td/>
                    <td colSpan={5}>
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
                )
              ])}
            </tbody>
          </table>
        </div>
        <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onChange={setPage}/>
      </section>

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
