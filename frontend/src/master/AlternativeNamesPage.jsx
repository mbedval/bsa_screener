import React, { useEffect, useMemo, useState } from 'react'
import { Edit2, Plus, Trash2, GitCompare, RefreshCw } from 'lucide-react'
import * as api from './api.js'
import {
  useToast, Modal, ConfirmDialog, Pagination,
  SectionHeader, SearchBar, FormGroup, Input, Textarea
} from './ui.jsx'

const PAGE_SIZE = 10

export default function AlternativeNamesPage() {
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [page, setPage]         = useState(1)
  const [search, setSearch]     = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState(null)
  const [confirm, setConfirm]   = useState(null)
  const [saving, setSaving]     = useState(false)
  const [form, setForm]         = useState({ data_ticker: '', current_ticker: '', company_name: '', notes: '' })

  const [sortKey, setSortKey]   = useState('')
  const [sortAsc, setSortAsc]   = useState(true)

  const { show, ToastContainer } = useToast()

  const load = async () => {
    setLoading(true)
    try { setRows(await api.alternativeNames.list()) }
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
      (r.data_ticker || '').toLowerCase().includes(q) ||
      (r.current_ticker || '').toLowerCase().includes(q) ||
      (r.company_name || '').toLowerCase().includes(q) ||
      (r.notes || '').toLowerCase().includes(q)
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

  const openNew  = () => {
    setEditing(null)
    setForm({ data_ticker: '', current_ticker: '', company_name: '', notes: '' })
    setShowForm(true)
  }

  const openEdit = row => {
    setEditing(row)
    setForm({
      data_ticker: row.data_ticker || '',
      current_ticker: row.current_ticker || '',
      company_name: row.company_name || '',
      notes: row.notes || ''
    })
    setShowForm(true)
  }

  const save = async () => {
    if (!form.data_ticker.trim() || !form.current_ticker.trim()) return
    setSaving(true)
    try {
      const body = {
        data_ticker: form.data_ticker.trim().toUpperCase(),
        current_ticker: form.current_ticker.trim().toUpperCase(),
        company_name: form.company_name.trim() || null,
        notes: form.notes.trim() || null
      }
      if (editing) {
        await api.alternativeNames.update(editing.id, body)
        show('Alternative name mapping updated')
      } else {
        await api.alternativeNames.create(body)
        show('Alternative name mapping created')
      }
      setShowForm(false)
      load()
    } catch (e) { show(e.message, 'error') }
    finally { setSaving(false) }
  }

  const del = async id => {
    try {
      await api.alternativeNames.remove(id)
      show('Mapping deleted')
      load()
    } catch (e) { show(e.message, 'error') }
  }

  return (
    <div className="master-page">
      {ToastContainer}
      <SectionHeader
        title="Alternative Names (Ticker Aliases)"
        sub={`${filtered.length} mapping${filtered.length !== 1 ? 's' : ''} · map data download tickers to current official share names`}
        actions={<button className="btn-primary" onClick={openNew}><Plus size={14}/> Add Mapping</button>}
      />

      <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search data ticker, current name, company..."/>

      <section className="panel data-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th onClick={() => handleSort('data_ticker')} style={{cursor:'pointer'}}>Data Download Ticker</th>
                <th onClick={() => handleSort('current_ticker')} style={{cursor:'pointer'}}>Current Official Ticker</th>
                <th onClick={() => handleSort('company_name')} style={{cursor:'pointer'}}>Company Name</th>
                <th onClick={() => handleSort('notes')} style={{cursor:'pointer'}}>Notes / Reason</th>
                <th onClick={() => handleSort('last_updated')} style={{cursor:'pointer'}}>Last Updated</th>
                <th style={{width:90}}/>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6}><div className="state">Loading mappings…</div></td></tr>}
              {!loading && paged.length === 0 && (
                <tr><td colSpan={6}><div className="state">No ticker alias mappings found.</div></td></tr>
              )}
              {!loading && paged.map(row => (
                <tr key={row.id} className="data-row">
                  <td>
                    <b style={{color:'#e5a93c', fontFamily:"'DM Mono'"}}>
                      {row.data_ticker}
                    </b>
                  </td>
                  <td>
                    <span style={{color:'#7ec8f0', fontWeight:700, fontFamily:"'DM Mono'", display:'flex', alignItems:'center', gap:5}}>
                      <GitCompare size={13} style={{color:'#52c41a'}}/>
                      {row.current_ticker}
                    </span>
                  </td>
                  <td style={{maxWidth:260, overflow:'hidden', textOverflow:'ellipsis'}}>{row.company_name || '—'}</td>
                  <td style={{color:'#7090b0', fontSize:12, maxWidth:280, overflow:'hidden', textOverflow:'ellipsis'}}>{row.notes || '—'}</td>
                  <td style={{fontSize:12, color:'#8a9ab0'}}>{row.last_updated ? row.last_updated.slice(0, 10) : '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn sm" title="Edit mapping" onClick={() => openEdit(row)}><Edit2 size={13}/></button>
                      <button className="icon-btn sm danger" title="Delete mapping" onClick={() => setConfirm(row)}><Trash2 size={13}/></button>
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
        <Modal title={editing ? `Edit Mapping for ${editing.data_ticker}` : 'Add Alternative Ticker Mapping'} onClose={() => setShowForm(false)} size="md">
          <div className="form-grid2">
            <FormGroup label="Data Download Ticker" hint="e.g. ZOMATO" required>
              <Input
                value={form.data_ticker}
                disabled={!!editing}
                onChange={e => setForm(f => ({ ...f, data_ticker: e.target.value.toUpperCase() }))}
                placeholder="e.g. ZOMATO"
              />
            </FormGroup>
            <FormGroup label="Current Official Ticker" hint="e.g. ETERNAL" required>
              <Input
                value={form.current_ticker}
                onChange={e => setForm(f => ({ ...f, current_ticker: e.target.value.toUpperCase() }))}
                placeholder="e.g. ETERNAL"
              />
            </FormGroup>
          </div>
          <FormGroup label="Company Name" hint="optional">
            <Input
              value={form.company_name}
              onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
              placeholder="e.g. Eternal Ltd (formerly Zomato Ltd)"
            />
          </FormGroup>
          <FormGroup label="Notes / Reason for Name Change" hint="optional">
            <Textarea
              rows={2}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Company rebranded to Eternal Ltd; raw download feed continues using ZOMATO"
            />
          </FormGroup>
          <div className="form-actions">
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving || !form.data_ticker.trim() || !form.current_ticker.trim()}>
              {saving ? 'Saving…' : editing ? 'Update Mapping' : 'Save Mapping'}
            </button>
          </div>
        </Modal>
      )}

      {/* Confirm Delete modal */}
      {confirm && (
        <ConfirmDialog
          title="Delete Ticker Alias Mapping?"
          message={`Are you sure you want to remove the mapping for data ticker "${confirm.data_ticker}" -> "${confirm.current_ticker}"?`}
          onConfirm={() => { del(confirm.id); setConfirm(null) }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
