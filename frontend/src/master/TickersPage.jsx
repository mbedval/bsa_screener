import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Edit2, Globe, Plus, Tag, Trash2, X } from 'lucide-react'
import * as api from './api.js'
import {
  useToast, Modal, ConfirmDialog, Pagination, SectionHeader, SearchBar,
  FormGroup, Input, Select, Checkbox, TagInput, MultiPicker,
  FnoBadge, IndexChip, SectorChip, CountBadge, EmptyState
} from './ui.jsx'

const PAGE_SIZE = 50

export default function TickersPage() {
  const [rows, setRows]           = useState([])
  const [sectors, setSectors]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [filterFno, setFilterFno] = useState('')       // '' | 'true' | 'false'
  const [filterSector, setFilterSector] = useState('') // sector id string
  const [sortKey, setSortKey]     = useState('ticker')
  const [sortAsc, setSortAsc]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState(null)
  const [confirm, setConfirm]     = useState(null)
  const [sectorModal, setSectorModal] = useState(null)
  const [selSectors, setSelSectors]   = useState([])
  const [saving, setSaving]       = useState(false)
  const [form, setForm]           = useState({ ticker: '', company_name: '', is_fno: false, index_memberships: [], exchange: 'NSE' })
  const { show, ToastContainer }  = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const [t, s] = await Promise.all([api.tickers.list(), api.sectors.list()])
      setRows(t); setSectors(s)
    } catch (e) { show(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  // ── Filter + sort client-side ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    let r = rows
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(t => t.ticker.toLowerCase().includes(q) || (t.company_name || '').toLowerCase().includes(q))
    }
    if (filterFno !== '') r = r.filter(t => String(t.is_fno) === filterFno)
    if (filterSector) {
      const sid = parseInt(filterSector)
      r = r.filter(t => (t.sectors || []).some(s => s.id === sid))
    }
    if (sortKey) {
      r = [...r].sort((a, b) => {
        const av = (a[sortKey] ?? ''), bv = (b[sortKey] ?? '')
        return String(av).localeCompare(String(bv), undefined, {numeric: true}) * (sortAsc ? 1 : -1)
      })
    }
    return r
  }, [rows, search, filterFno, filterSector, sortKey, sortAsc])

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const sort = key => { setSortKey(key); setSortAsc(k => sortKey === key ? !sortAsc : true); setPage(1) }

  // ── Forms ─────────────────────────────────────────────────────────────────
  const openNew  = () => {
    setEditing(null)
    setForm({ ticker: '', company_name: '', is_fno: false, index_memberships: [], exchange: 'NSE' })
    setShowForm(true)
  }
  const openEdit = row => {
    setEditing(row)
    setForm({ ticker: row.ticker, company_name: row.company_name, is_fno: row.is_fno, index_memberships: row.index_memberships || [], exchange: row.exchange || 'NSE' })
    setShowForm(true)
  }
  const openSectors = row => {
    setSectorModal(row)
    setSelSectors((row.sectors || []).map(s => s.id))
  }

  const save = async () => {
    if (!form.ticker.trim() || !form.company_name.trim()) return
    setSaving(true)
    try {
      const body = { ...form, ticker: form.ticker.trim().toUpperCase() }
      if (editing) { await api.tickers.update(editing.ticker, body); show('Ticker updated') }
      else         { await api.tickers.create(body);                   show('Ticker created') }
      setShowForm(false); load()
    } catch (e) { show(e.message, 'error') }
    finally { setSaving(false) }
  }

  const saveSectors = async () => {
    setSaving(true)
    try {
      await api.tickers.setSectors(sectorModal.ticker, selSectors)
      show('Sector assignments saved'); setSectorModal(null); load()
    } catch (e) { show(e.message, 'error') }
    finally { setSaving(false) }
  }

  const del = async ticker => {
    try { await api.tickers.remove(ticker); show('Ticker deleted'); load() }
    catch (e) { show(e.message, 'error') }
  }

  const SortTh = ({ k, children }) => (
    <th onClick={() => sort(k)} style={{cursor:'pointer', whiteSpace:'nowrap'}}>
      {children}{sortKey === k && (sortAsc ? ' ↑' : ' ↓')}
    </th>
  )

  return (
    <div className="master-page">
      {ToastContainer}
      <SectionHeader
        title="Ticker Master"
        sub={`${filtered.length} of ${rows.length} tickers`}
        actions={<button className="btn-primary" onClick={openNew}><Plus size={14}/> Add Ticker</button>}
      />

      {/* Toolbar: search + filters */}
      <div className="ticker-toolbar">
        <SearchBar
          value={search}
          onChange={v => { setSearch(v); setPage(1) }}
          placeholder="Search ticker or company name…"
        />
        <div className="filter-row">
          <Select value={filterFno} onChange={e => { setFilterFno(e.target.value); setPage(1) }} style={{width:130}}>
            <option value="">All types</option>
            <option value="true">F&amp;O only</option>
            <option value="false">Cash only</option>
          </Select>
          <Select value={filterSector} onChange={e => { setFilterSector(e.target.value); setPage(1) }} style={{width:180}}>
            <option value="">All sectors</option>
            {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          {(search || filterFno || filterSector) &&
            <button className="btn-ghost sm" onClick={() => { setSearch(''); setFilterFno(''); setFilterSector(''); setPage(1) }}>
              <X size={12}/> Clear
            </button>
          }
        </div>
      </div>

      <section className="panel data-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <SortTh k="ticker">Ticker</SortTh>
                <SortTh k="company_name">Company</SortTh>
                <th>Sectors</th>
                <th style={{width:90}}/>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4}><div className="state">Loading tickers…</div></td></tr>}
              {!loading && paged.length === 0 && (
                <tr><td colSpan={4}><div className="state">No tickers match your filters.</div></td></tr>
              )}
              {!loading && paged.map(row => (
                <tr key={row.ticker} className="data-row">
                  <td><b style={{color:'#7ec8f0', fontFamily:"'DM Mono'"}}>{row.ticker}</b></td>
                  <td style={{maxWidth:280, overflow:'hidden', textOverflow:'ellipsis'}}>{row.company_name}</td>
                  <td>
                    <div className="chip-wrap sm" style={{alignItems:'center'}}>
                      {(row.sectors || []).map(s => <SectorChip key={s.id} label={s.name}/>)}
                      <button className="chip-edit-btn" title="Edit sector assignments" onClick={() => openSectors(row)}>
                        <Tag size={10}/>
                      </button>
                    </div>
                  </td>
                  <td>
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

      {/* Add / Edit modal */}
      {showForm && (
        <Modal
          title={editing ? `Edit ${editing.ticker}` : 'Add Ticker'}
          subtitle={editing ? editing.company_name : 'Enter ticker details'}
          onClose={() => setShowForm(false)}
        >
          <div className="form-grid2">
            <FormGroup label="Ticker symbol" required>
              <Input
                value={form.ticker}
                disabled={!!editing}
                onChange={e => setForm(f => ({...f, ticker: e.target.value.toUpperCase()}))}
                placeholder="e.g. RELIANCE"
              />
            </FormGroup>
            <FormGroup label="Exchange">
              <Select value={form.exchange} onChange={e => setForm(f => ({...f, exchange: e.target.value}))}>
                <option>NSE</option>
                <option>BSE</option>
              </Select>
            </FormGroup>
          </div>
          <FormGroup label="Company name" required>
            <Input
              value={form.company_name}
              onChange={e => setForm(f => ({...f, company_name: e.target.value}))}
              placeholder="e.g. Reliance Industries Ltd"
            />
          </FormGroup>
          <FormGroup label="Index memberships" hint="type and press Enter to add">
            <TagInput
              value={form.index_memberships}
              onChange={v => setForm(f => ({...f, index_memberships: v}))}
              placeholder="e.g. NIFTY50, NIFTY IT…"
            />
          </FormGroup>
          <FormGroup label="">
            <Checkbox
              label="Part of F&O (Futures & Options)"
              checked={form.is_fno}
              onChange={e => setForm(f => ({...f, is_fno: e.target.checked}))}
            />
          </FormGroup>
          <div className="form-actions">
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving || !form.ticker.trim() || !form.company_name.trim()}>
              {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
            </button>
          </div>
        </Modal>
      )}

      {/* Sector assignment modal */}
      {sectorModal && (
        <Modal
          title={`Sectors for ${sectorModal.ticker}`}
          subtitle="Select all sectors this ticker belongs to"
          onClose={() => setSectorModal(null)}
        >
          <MultiPicker
            items={sectors.map(s => ({...s, count: undefined}))}
            selected={selSectors}
            onChange={setSelSectors}
            labelKey="name"
            valueKey="id"
          />
          <div className="form-actions">
            <button className="btn-ghost" onClick={() => setSectorModal(null)}>Cancel</button>
            <button className="btn-primary" onClick={saveSectors} disabled={saving}>
              {saving ? 'Saving…' : 'Save assignments'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {confirm && (
        <ConfirmDialog
          title="Delete ticker?"
          message={`"${confirm.ticker}" (${confirm.company_name}) will be removed from ticker_master and all sector and watchlist mappings.`}
          onConfirm={() => del(confirm.ticker)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
