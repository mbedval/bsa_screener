import React, { useEffect, useState, useMemo } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
import { useToast, ConfirmDialog, SectionHeader, SearchBar, Pagination, TruncatedCellText } from './ui.jsx'
import AddRecommendationModal from './AddRecommendationModal.jsx'
import * as api from './api.js'

const PAGE_SIZE = 50

export default function RecommendationsPage() {
  const [recs, setRecs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  
  const [addModal, setAddModal] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [confirmBatchDel, setConfirmBatchDel] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const { show, ToastContainer } = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/recommendations')
      if (!res.ok) {
        setRecs([])
        return
      }
      const data = await res.json()
      setRecs(Array.isArray(data) ? data : [])
    } catch (e) {
      console.warn('Failed to fetch recommendations:', e)
      setRecs([])
    } finally {
      setLoading(false)
    }
  }

  const del = async (id) => {
    try {
      const res = await fetch(`/api/recommendations/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      show('Recommendation deleted', 'success')
      setConfirmDel(null)
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      load()
    } catch (e) {
      show(e.message, 'error')
    }
  }

  const delBatch = async () => {
    try {
      const ids = Array.from(selectedIds)
      const res = await api.recommendations.removeBatch(ids)
      show(`Deleted ${res.deleted_count || ids.length} recommendations`, 'success')
      setSelectedIds(new Set())
      setConfirmBatchDel(false)
      load()
    } catch (e) {
      show(e.message, 'error')
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (!search) return recs
    const q = search.toLowerCase()
    return recs.filter(r => 
      r.ticker.toLowerCase().includes(q) || 
      r.recommender.toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q)
    )
  }, [recs, search])

  const paged = useMemo(() => {
    const s = (page - 1) * PAGE_SIZE
    return filtered.slice(s, s + PAGE_SIZE)
  }, [filtered, page])

  const allPagedSelected = paged.length > 0 && paged.every(r => selectedIds.has(r.id))

  const toggleSelectAllPaged = () => {
    const next = new Set(selectedIds)
    if (allPagedSelected) {
      paged.forEach(r => next.delete(r.id))
    } else {
      paged.forEach(r => next.add(r.id))
    }
    setSelectedIds(next)
  }

  const toggleSelect = (id) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const openNew = () => {
    setAddModal(true)
  }

  return (
    <div className="master-page">
      {ToastContainer}
      <SectionHeader
        title="Recommendations Master"
        sub={`${filtered.length} recommendations logged`}
        actions={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {selectedIds.size > 0 && (
              <button className="btn-danger" onClick={() => setConfirmBatchDel(true)}>
                <Trash2 size={14}/> Delete Selected ({selectedIds.size})
              </button>
            )}
            <button className="btn-primary" onClick={openNew}><Plus size={14}/> Add Recommendation</button>
          </div>
        }
      />

      <div className="controls-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SearchBar value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search ticker, recommender..." />
        {selectedIds.size > 0 && (
          <span style={{ fontSize: 13, color: '#7ec8f0' }}>
            {selectedIds.size} row{selectedIds.size > 1 ? 's' : ''} selected
            <button className="btn-ghost sm" onClick={() => setSelectedIds(new Set())} style={{ marginLeft: 8 }}>Deselect all</button>
          </span>
        )}
      </div>

      <div className="table-wrap">
        <table className="table">
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
              <th>Date</th>
              <th>Ticker</th>
              <th>Recommender</th>
              <th>CMP / Stop / Target</th>
              <th>Period</th>
              <th>Description</th>
              <th style={{ width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8}><div className="state">Loading...</div></td></tr>}
            {!loading && paged.length === 0 && (
              <tr><td colSpan={8}><div className="state">No recommendations found.</div></td></tr>
            )}
            {!loading && paged.map(row => (
              <tr key={row.id} className={`data-row ${selectedIds.has(row.id) ? 'selected-row' : ''}`}>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggleSelect(row.id)}
                    style={{ cursor: 'pointer' }}
                  />
                </td>
                <td style={{ width: 100 }}>{row.rec_date}</td>
                <td><b style={{ color: '#7ec8f0' }}>{row.ticker}</b></td>
                <td><b>{row.recommender}</b></td>
                <td style={{ width: 200 }}>
                  {row.cmp ? `${row.cmp}` : '-'} / {row.stop_loss ? `${row.stop_loss}` : '-'} / {row.target ? `${row.target}` : '-'}
                </td>
                <td style={{ width: 120 }}>{row.time_period || '-'}</td>
                <td style={{ maxWidth: 250 }}>
                  <TruncatedCellText text={row.description} title="Recommendation Notes" />
                </td>
                <td>
                  <div className="row-actions">
                    <button className="icon-btn sm danger" title="Delete" onClick={() => setConfirmDel(row)}><Trash2 size={13}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onChange={setPage} />

      {addModal && (
        <AddRecommendationModal 
          onClose={() => setAddModal(false)}
          onSuccess={() => load()}
        />
      )}

      {confirmDel && (
        <ConfirmDialog
          title="Delete Recommendation?"
          message={`Are you sure you want to delete the recommendation by ${confirmDel.recommender} for ${confirmDel.ticker}?`}
          onConfirm={() => del(confirmDel.id)}
          onClose={() => setConfirmDel(null)}
        />
      )}

      {confirmBatchDel && (
        <ConfirmDialog
          title={`Delete ${selectedIds.size} Recommendations?`}
          message={`Are you sure you want to permanently delete ${selectedIds.size} selected recommendation records? This action cannot be undone.`}
          confirmLabel={`Delete ${selectedIds.size} Items`}
          onConfirm={delBatch}
          onClose={() => setConfirmBatchDel(false)}
        />
      )}
    </div>
  )
}
