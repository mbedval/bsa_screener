import React, { useEffect, useMemo, useState } from 'react'
import { Edit2, Plus, Trash2, User } from 'lucide-react'
import * as api from './api.js'
import {
  useToast, Modal, ConfirmDialog, Pagination, SectionHeader, SearchBar,
  FormGroup, Input, Select, CountBadge
} from './ui.jsx'

const PAGE_SIZE = 25

export default function UsersPage() {
  const [users, setUsers]           = useState([])
  const [watchlists, setWatchlists] = useState([])
  const [loading, setLoading]       = useState(true)
  const [page, setPage]             = useState(1)
  const [search, setSearch]         = useState('')
  const [showForm, setShowForm]     = useState(false)
  const [editing, setEditing]       = useState(null)
  const [confirm, setConfirm]       = useState(null)
  const [saving, setSaving]         = useState(false)
  const [form, setForm]             = useState({ email: '', first_name: '', last_name: '', watchlist_id: '' })
  const { show, ToastContainer }    = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const [u, w] = await Promise.all([api.users.list(), api.watchlists.list()])
      setUsers(u); setWatchlists(w)
    } catch (e) { show(e.message, 'error') }
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
    const q = search.toLowerCase()
    let list = !q ? users : users.filter(u =>
      u.email.toLowerCase().includes(q) ||
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(q)
    )
    if (sortKey) {
      list = [...list].sort((a, b) => {
        const valA = a[sortKey] ?? ''
        const valB = b[sortKey] ?? ''
        return String(valA).localeCompare(String(valB), undefined, { numeric: true }) * (sortAsc ? 1 : -1)
      })
    }
    return list
  }, [users, search, sortKey, sortAsc])

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const openNew  = () => { setEditing(null); setForm({ email: '', first_name: '', last_name: '', watchlist_id: '' }); setShowForm(true) }
  const openEdit = u  => { setEditing(u); setForm({ email: u.email, first_name: u.first_name, last_name: u.last_name, watchlist_id: u.watchlist_id || '' }); setShowForm(true) }

  const save = async () => {
    if (!form.email.trim() || !form.first_name.trim() || !form.last_name.trim()) return
    setSaving(true)
    try {
      const body = { ...form, watchlist_id: form.watchlist_id ? parseInt(form.watchlist_id) : null }
      if (editing) { await api.users.update(editing.email, body); show('User updated') }
      else         { await api.users.create(body);                 show('User created') }
      setShowForm(false); load()
    } catch (e) { show(e.message, 'error') }
    finally { setSaving(false) }
  }

  const del = async email => {
    try { await api.users.remove(email); show('User deleted'); load() }
    catch (e) { show(e.message, 'error') }
  }

  return (
    <div className="master-page">
      {ToastContainer}
      <SectionHeader
        title="Users"
        sub={`${filtered.length} user${filtered.length !== 1 ? 's' : ''}`}
        actions={<button className="btn-primary" onClick={openNew}><Plus size={14}/> Add User</button>}
      />

      <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search by name or email…"/>

      <section className="panel data-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th onClick={() => handleSort('email')} style={{cursor:'pointer'}}>Email {sortKey === 'email' && (sortAsc ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('first_name')} style={{cursor:'pointer'}}>First name {sortKey === 'first_name' && (sortAsc ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('last_name')} style={{cursor:'pointer'}}>Last name {sortKey === 'last_name' && (sortAsc ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('watchlist_name')} style={{cursor:'pointer'}}>Watchlist {sortKey === 'watchlist_name' && (sortAsc ? '↑' : '↓')}</th>
                <th style={{width:90}}/>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5}><div className="state">Loading…</div></td></tr>}
              {!loading && paged.length === 0 && (
                <tr><td colSpan={5}><div className="state">No users found.</div></td></tr>
              )}
              {!loading && paged.map(u => (
                <tr key={u.email} className="data-row">
                  <td>
                    <span style={{display:'flex', alignItems:'center', gap:7}}>
                      <span style={{background:'#1a3150', borderRadius:'50%', width:28, height:28, display:'grid', placeItems:'center', flexShrink:0}}>
                        <User size={13} style={{color:'#5d8fcb'}}/>
                      </span>
                      <span style={{fontFamily:"'DM Mono'", fontSize:12}}>{u.email}</span>
                    </span>
                  </td>
                  <td>{u.first_name}</td>
                  <td>{u.last_name}</td>
                  <td>
                    {u.watchlist_name
                      ? <span className="badge neutral" style={{fontSize:11}}>{u.watchlist_name}</span>
                      : <span style={{color:'#4a6a8a', fontSize:11}}>—</span>
                    }
                  </td>
                  <td>
                    <div className="row-actions">

                      <button className="icon-btn sm" title="Edit" onClick={() => openEdit(u)}><Edit2 size={13}/></button>
                      <button className="icon-btn sm danger" title="Delete" onClick={() => setConfirm(u)}><Trash2 size={13}/></button>
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
          title={editing ? `Edit ${editing.first_name} ${editing.last_name}` : 'Add User'}
          onClose={() => setShowForm(false)}
        >
          <FormGroup label="Email address" required>
            <Input
              type="email"
              value={form.email}
              disabled={!!editing}
              onChange={e => setForm(f => ({...f, email: e.target.value.toLowerCase()}))}
              placeholder="user@example.com"
            />
          </FormGroup>
          <div className="form-grid2">
            <FormGroup label="First name" required>
              <Input value={form.first_name} onChange={e => setForm(f => ({...f, first_name: e.target.value}))} placeholder="First name"/>
            </FormGroup>
            <FormGroup label="Last name" required>
              <Input value={form.last_name} onChange={e => setForm(f => ({...f, last_name: e.target.value}))} placeholder="Last name"/>
            </FormGroup>
          </div>
          <FormGroup label="Assigned watchlist" hint="optional">
            <Select value={form.watchlist_id} onChange={e => setForm(f => ({...f, watchlist_id: e.target.value}))}>
              <option value="">— No watchlist —</option>
              {watchlists.map(w => (
                <option key={w.id} value={w.id}>{w.name} ({(w.tickers || []).length} tickers)</option>
              ))}
            </Select>
          </FormGroup>
          <div className="form-actions">
            <button className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button
              className="btn-primary"
              onClick={save}
              disabled={saving || !form.email.trim() || !form.first_name.trim() || !form.last_name.trim()}
            >
              {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
            </button>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {confirm && (
        <ConfirmDialog
          title="Delete user?"
          message={`${confirm.first_name} ${confirm.last_name} (${confirm.email}) will be permanently removed.`}
          onConfirm={() => del(confirm.email)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
