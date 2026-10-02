import React, { useEffect, useMemo, useState } from 'react'
import { Edit2, Mail, Plus, Trash2, User, Download } from 'lucide-react'
import * as api from './api.js'
import {
  useToast, Modal, ConfirmDialog, Pagination, SectionHeader, SearchBar,
  FormGroup, Input, Select, CountBadge, TruncatedCellText
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
  const [confirmBatch, setConfirmBatch] = useState(false)
  const [selectedEmails, setSelectedEmails] = useState(new Set())
  const [saving, setSaving]         = useState(false)
  const [form, setForm]             = useState({ email: '', first_name: '', last_name: '', watchlist_id: '', is_subscribed: false })
  const { show, ToastContainer }    = useToast()

  const triggerNewsletter = async email => {
    try {
      show('Generating PDF reports and sending email newsletter...', 'info')
      const res = await api.users.sendNewsletter(email)
      show(res.detail || 'Newsletter sent successfully!', 'success')
    } catch (e) {
      show(e.message, 'error')
    }
  }

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

  const allPagedSelected = paged.length > 0 && paged.every(u => selectedEmails.has(u.email))

  const toggleSelectAllPaged = () => {
    const next = new Set(selectedEmails)
    if (allPagedSelected) {
      paged.forEach(u => next.delete(u.email))
    } else {
      paged.forEach(u => next.add(u.email))
    }
    setSelectedEmails(next)
  }

  const toggleSelect = email => {
    const next = new Set(selectedEmails)
    if (next.has(email)) next.delete(email)
    else next.add(email)
    setSelectedEmails(next)
  }

  const openNew  = () => { setEditing(null); setForm({ email: '', first_name: '', last_name: '', watchlist_id: '', is_subscribed: false }); setShowForm(true) }
  const openEdit = u  => { setEditing(u); setForm({ email: u.email, first_name: u.first_name, last_name: u.last_name, watchlist_id: u.watchlist_id || '', is_subscribed: !!u.is_subscribed }); setShowForm(true) }

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
    try {
      await api.users.remove(email)
      show('User deleted')
      setSelectedEmails(prev => {
        const next = new Set(prev)
        next.delete(email)
        return next
      })
      load()
    } catch (e) { show(e.message, 'error') }
  }

  const delBatch = async () => {
    try {
      const emails = Array.from(selectedEmails)
      const res = await api.users.removeBatch(emails)
      show(`Deleted ${res.deleted_count || emails.length} users successfully`)
      setSelectedEmails(new Set())
      setConfirmBatch(false)
      load()
    } catch (e) { show(e.message, 'error') }
  }

  return (
    <div className="master-page">
      {ToastContainer}
      <SectionHeader
        title="Users"
        sub={`${filtered.length} user${filtered.length !== 1 ? 's' : ''}`}
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {selectedEmails.size > 0 && (
              <button className="btn-danger" onClick={() => setConfirmBatch(true)}>
                <Trash2 size={14}/> Delete Selected ({selectedEmails.size})
              </button>
            )}
            <button className="btn-primary" onClick={openNew}><Plus size={14}/> Add User</button>
          </div>
        }
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search by name or email…"/>
        {selectedEmails.size > 0 && (
          <span style={{ fontSize: 13, color: '#7ec8f0' }}>
            {selectedEmails.size} user{selectedEmails.size > 1 ? 's' : ''} selected
            <button className="btn-ghost sm" onClick={() => setSelectedEmails(new Set())} style={{ marginLeft: 8 }}>Deselect all</button>
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
                <th onClick={() => handleSort('email')} style={{cursor:'pointer'}}>Email {sortKey === 'email' && (sortAsc ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('first_name')} style={{cursor:'pointer'}}>First name {sortKey === 'first_name' && (sortAsc ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('last_name')} style={{cursor:'pointer'}}>Last name {sortKey === 'last_name' && (sortAsc ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('watchlist_name')} style={{cursor:'pointer'}}>Watchlist {sortKey === 'watchlist_name' && (sortAsc ? '↑' : '↓')}</th>
                <th onClick={() => handleSort('is_subscribed')} style={{cursor:'pointer'}}>Newsletter {sortKey === 'is_subscribed' && (sortAsc ? '↑' : '↓')}</th>
                <th style={{width:120}}/>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7}><div className="state">Loading…</div></td></tr>}
              {!loading && paged.length === 0 && (
                <tr><td colSpan={7}><div className="state">No users found.</div></td></tr>
              )}
              {!loading && paged.map(u => (
                <tr key={u.email} className={`data-row ${selectedEmails.has(u.email) ? 'selected-row' : ''}`}>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedEmails.has(u.email)}
                      onChange={() => toggleSelect(u.email)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td>
                    <span style={{display:'flex', alignItems:'center', gap:7}}>
                      <span style={{background:'#1a3150', borderRadius:'50%', width:28, height:28, display:'grid', placeItems:'center', flexShrink:0}}>
                        <User size={13} style={{color:'#5d8fcb'}}/>
                      </span>
                      <span style={{fontFamily:"'DM Mono'", fontSize:12}}>
                        <TruncatedCellText text={u.email} title="User Email" maxLen={22} truncLen={18} />
                      </span>
                    </span>
                  </td>
                  <td><TruncatedCellText text={u.first_name} title="First Name" /></td>
                  <td><TruncatedCellText text={u.last_name} title="Last Name" /></td>
                  <td>
                    {u.watchlist_name
                      ? <span className="badge neutral" style={{fontSize:11}}>{u.watchlist_name}</span>
                      : <span style={{color:'#4a6a8a', fontSize:11}}>—</span>
                    }
                  </td>
                  <td>
                    {u.is_subscribed
                      ? <span className="badge success" style={{fontSize:11}}>Subscribed</span>
                      : <span className="badge danger" style={{fontSize:11}}>No</span>
                    }
                  </td>
                  <td>
                    <div className="row-actions">
                      {u.is_subscribed && u.watchlist_id && (
                        <>
                          <button className="icon-btn sm" title="Download Newsletter PDF" onClick={() => window.open(`/api/master/users/${encodeURIComponent(u.email)}/newsletter-download`, '_blank')} style={{color:'#66e4ca'}}><Download size={13}/></button>
                          <button className="icon-btn sm" title="Send Daily Watchlist Reports Now" onClick={() => triggerNewsletter(u.email)} style={{color:'#66e4ca'}}><Mail size={13}/></button>
                        </>
                      )}
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
          <FormGroup label="Daily newsletter subscription">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 4 }}>
              <input
                type="checkbox"
                checked={form.is_subscribed}
                onChange={e => setForm(f => ({ ...f, is_subscribed: e.target.checked }))}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, color: '#94a3b8' }}>Subscribe user to daily email newsletter containing watchlist reports</span>
            </label>
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

      {/* Batch delete confirm */}
      {confirmBatch && (
        <ConfirmDialog
          title={`Delete ${selectedEmails.size} Users?`}
          message={`Are you sure you want to permanently remove ${selectedEmails.size} selected users? This action cannot be undone.`}
          confirmLabel={`Delete ${selectedEmails.size} Users`}
          onConfirm={delBatch}
          onClose={() => setConfirmBatch(false)}
        />
      )}
    </div>
  )
}
