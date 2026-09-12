import React, { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Plus, Trash2, Globe, Edit2, Link2 } from 'lucide-react'
import * as api from './api.js'
import {
  useToast, Modal, ConfirmDialog, Pagination, SectionHeader, SearchBar,
  FormGroup, Input, Select, CountBadge, TruncatedCellText
} from './ui.jsx'

const PAGE_SIZE = 10

export default function ReferencePagesPage({ dataset }) {
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [showForm, setShowForm]   = useState(false)
  const [editing, setEditing]     = useState(null)
  const [confirm, setConfirm]     = useState(null)
  const [saving, setSaving]       = useState(false)
  const [form, setForm]           = useState({ title: '', url: '', category: 'General', description: '' })
  const { show, ToastContainer }  = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.referencePages.list(dataset)
      setItems(Array.isArray(data) ? data : [])
    } catch (e) {
      show(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [dataset])

  const categories = useMemo(() => {
    const set = new Set(items.map(i => i.category).filter(Boolean))
    return ['ALL', ...Array.from(set)]
  }, [items])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return items.filter(item => {
      const matchesSearch = !q ||
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.url && item.url.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q))
      const matchesCat = categoryFilter === 'ALL' || item.category === categoryFilter
      return matchesSearch && matchesCat
    })
  }, [items, search, categoryFilter])

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, page])

  const handleOpenAdd = () => {
    setEditing(null)
    setForm({ title: '', url: '', category: 'General', description: '' })
    setShowForm(true)
  }

  const handleOpenEdit = (item) => {
    setEditing(item)
    setForm({ title: item.title, url: item.url, category: item.category || 'General', description: item.description || '' })
    setShowForm(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.title.trim() || !form.url.trim()) {
      show('Title and Hyperlink URL are required.', 'error')
      return
    }

    setSaving(true)
    try {
      if (editing) {
        await api.referencePages.update(editing.id, form, dataset)
        show(`Updated reference page "${form.title}"`, 'success')
      } else {
        await api.referencePages.create(form, dataset)
        show(`Added reference page "${form.title}"`, 'success')
      }
      setShowForm(false)
      load()
    } catch (err) {
      show(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.referencePages.remove(id, dataset)
      show('Reference link deleted', 'success')
      setConfirm(null)
      load()
    } catch (err) {
      show(err.message, 'error')
    }
  }

  const handleAddSamples = async () => {
    const samples = [
      { title: 'NSE India Official', url: 'https://www.nseindia.com', category: 'Exchange', description: 'National Stock Exchange of India' },
      { title: 'BSE India Portal', url: 'https://www.bseindia.com', category: 'Exchange', description: 'Bombay Stock Exchange Official Website' },
      { title: 'TradingView Charts', url: 'https://www.tradingview.com', category: 'Analytics', description: 'Advanced Financial Visualization & Technical Charting' },
      { title: 'Screener.in Financials', url: 'https://www.screener.in', category: 'Fundamental', description: 'Stock Analysis & Fundamental Research Tools' },
      { title: 'Moneycontrol News', url: 'https://www.moneycontrol.com', category: 'News & Media', description: 'Indian Stock Market News & Portfolio Tracker' },
      { title: 'SEBI Regulations', url: 'https://www.sebi.gov.in', category: 'Regulatory', description: 'Securities and Exchange Board of India' }
    ]
    for (const s of samples) {
      try { await api.referencePages.create(s, dataset) } catch (_) {}
    }
    show('Sample reference links added successfully', 'success')
    load()
  }

  return (
    <div className="submodule-page">
      {ToastContainer}

      <SectionHeader
        title="Reference Pages & Important URLs"
        sub="Repository of quick-access external resource links, market portals, documentation, and tools."
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-secondary" onClick={handleAddSamples}>
              <Plus size={15} /> Add Sample Links
            </button>
            <button className="btn-primary" onClick={handleOpenAdd}>
              <Plus size={15} /> Add Reference URL
            </button>
          </div>
        }
      />

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <SearchBar
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search by title, url, description..."
          />
        </div>
        {categories.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Category:</span>
            <Select
              value={categoryFilter}
              onChange={e => { setCategoryFilter(e.target.value); setPage(1) }}
              style={{ width: 140 }}
            >
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
        )}
        <CountBadge count={filtered.length} />
      </div>

      <div className="table-wrapper">
        <table className="master-table">
          <thead>
            <tr>
              <th style={{ width: 60 }}>#</th>
              <th>Resource Title</th>
              <th>Category</th>
              <th>Hyperlink URL</th>
              <th>Description / Notes</th>
              <th style={{ width: 100, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}><div className="state">Loading reference pages...</div></td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={6}><div className="state">No reference URLs found. Click "Add Reference URL" to add one.</div></td></tr>
            ) : paged.map((item, idx) => {
              const formattedUrl = (item.url || '').startsWith('http://') || (item.url || '').startsWith('https://') ? item.url : `https://${item.url}`
              return (
                <tr key={item.id} className="data-row">
                  <td style={{ color: '#64748b', fontWeight: 600 }}>{(page - 1) * PAGE_SIZE + idx + 1}</td>
                  <td style={{ fontWeight: 700, color: '#f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Globe size={14} style={{ color: '#38bdf8' }} />
                      <TruncatedCellText text={item.title} maxLen={35} />
                    </div>
                  </td>
                  <td>
                    <span style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                      {item.category || 'General'}
                    </span>
                  </td>
                  <td>
                    <a
                      href={formattedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600, textDecoration: 'underline' }}
                      title={`Open ${formattedUrl} in new tab`}
                    >
                      <Link2 size={13} />
                      <TruncatedCellText text={item.url} maxLen={40} />
                      <ExternalLink size={12} />
                    </a>
                  </td>
                  <td style={{ color: '#94a3b8', fontSize: 13 }}>
                    <TruncatedCellText text={item.description || '—'} maxLen={45} />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => handleOpenEdit(item)}
                        title="Edit Reference URL"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon danger"
                        onClick={() => setConfirm(item)}
                        title="Delete Reference URL"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        total={filtered.length}
        onChange={setPage}
      />

      {showForm && (
        <Modal title={editing ? 'Edit Reference URL' : 'Add Reference URL'} onClose={() => setShowForm(false)}>
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FormGroup label="Resource Title *">
              <Input
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. NSE India Derivative Option Chain"
                required
                autoFocus
              />
            </FormGroup>

            <FormGroup label="Hyperlink URL *">
              <Input
                value={form.url}
                onChange={e => setForm({ ...form, url: e.target.value })}
                placeholder="e.g. https://www.nseindia.com/option-chain"
                required
              />
            </FormGroup>

            <FormGroup label="Category">
              <Input
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                placeholder="e.g. Exchange, News, Documentation, Analytics"
              />
            </FormGroup>

            <FormGroup label="Description / Notes">
              <Input
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description or purpose of this reference link..."
              />
            </FormGroup>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update URL' : 'Add URL'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          title="Delete Reference Page"
          message={`Are you sure you want to delete "${confirm.title}"?`}
          onConfirm={() => handleDelete(confirm.id)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  )
}
