import React, { useEffect, useState, useMemo } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
import { useToast, ConfirmDialog, SectionHeader, SearchBar, Pagination } from './ui.jsx'
import AddRecommendationModal from './AddRecommendationModal.jsx'

const PAGE_SIZE = 50

export default function RecommendationsPage() {
  const [recs, setRecs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  
  const [addModal, setAddModal] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)

  const { show, ToastContainer } = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`http://localhost:8000/api/recommendations`)
      if (!res.ok) throw new Error('Failed to fetch recommendations')
      const data = await res.json()
      setRecs(data)
    } catch (e) {
      show(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const del = async (id) => {
    try {
      const res = await fetch(`http://localhost:8000/api/recommendations/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      show('Recommendation deleted', 'success')
      setConfirmDel(null)
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

  const openNew = () => {
    setAddModal(true)
  }

  return (
    <div className="master-page">
      {ToastContainer}
      <SectionHeader
        title="Recommendations Master"
        sub={`${filtered.length} recommendations logged`}
        actions={<button className="btn-primary" onClick={openNew}><Plus size={14}/> Add Recommendation</button>}
      />

      <div className="controls-row">
        <SearchBar value={search} onChange={setSearch} placeholder="Search ticker, recommender..." />
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
              <tr>
              <th>Date</th>
              <th>Ticker</th>
              <th>Recommender</th>
              <th>CMP / Stop / Target</th>
              <th>Period</th>
              <th>Description</th>
              <th style={{width: 50}}></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7}><div className="state">Loading...</div></td></tr>}
            {!loading && paged.length === 0 && (
              <tr><td colSpan={7}><div className="state">No recommendations found.</div></td></tr>
            )}
            {!loading && paged.map(row => (
              <tr key={row.id} className="data-row">
                <td style={{width: 100}}>{row.rec_date}</td>
                <td><b style={{color: '#7ec8f0'}}>{row.ticker}</b></td>
                <td><b>{row.recommender}</b></td>
                <td style={{width: 200}}>
                  {row.cmp ? `₹${row.cmp}` : '-'} / {row.stop_loss ? `₹${row.stop_loss}` : '-'} / {row.target ? `₹${row.target}` : '-'}
                </td>
                <td style={{width: 120}}>{row.time_period || '-'}</td>
                <td style={{maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}} title={row.description}>
                  {row.description || '-'}
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
    </div>
  )
}
