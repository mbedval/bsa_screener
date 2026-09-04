import React, { useEffect, useState } from 'react'
import { Plus, X, Trash2 } from 'lucide-react'
import { Modal, FormGroup, Input, Select, useToast } from './ui.jsx'

export default function RecommendationsModal({ ticker, onClose }) {
  const [loading, setLoading] = useState(true)
  const [recs, setRecs] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  
  const [form, setForm] = useState({
    rec_date: new Date().toISOString().split('T')[0],
    recommender: '',
    cmp: '',
    stop_loss: '',
    target: '',
    time_period: 'Long Term',
    description: ''
  })
  
  const { show, ToastContainer } = useToast()

  const loadRecs = async () => {
    setLoading(true)
    try {
      const res = await fetch(`http://localhost:8000/api/recommendations/${ticker.ticker}`)
      if (!res.ok) throw new Error('Failed to fetch recommendations')
      const data = await res.json()
      setRecs(data)
    } catch (e) {
      show(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (ticker) loadRecs()
  }, [ticker])

  const submit = async () => {
    if (!form.recommender) {
      return show('Recommender name is required', 'error')
    }
    setSaving(true)
    try {
      const payload = {
        ticker: ticker.ticker,
        rec_date: form.rec_date,
        recommender: form.recommender,
        cmp: form.cmp ? parseFloat(form.cmp) : null,
        stop_loss: form.stop_loss ? parseFloat(form.stop_loss) : null,
        target: form.target ? parseFloat(form.target) : null,
        time_period: form.time_period || null,
        description: form.description || null
      }
      const res = await fetch(`http://localhost:8000/api/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('Failed to save recommendation')
      show('Recommendation added', 'success')
      setShowForm(false)
      loadRecs()
    } catch (e) {
      show(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Recommendations for ${ticker.ticker}`} onClose={onClose} width={600}>
      <div className="section-head" style={{ marginBottom: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p>Broker and analyst recommendations</p>
        {!showForm && <button className="btn sm primary" onClick={() => setShowForm(true)}><Plus size={14}/> Add New</button>}
      </div>

      {showForm && (
        <div style={{ background: 'var(--panel-bg)', padding: 15, borderRadius: 6, marginBottom: 15, border: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, marginBottom: 10 }}>
            <FormGroup label="Recommender (e.g. Zerodha)">
              <Input value={form.recommender} onChange={e => setForm({...form, recommender: e.target.value})} autoFocus/>
            </FormGroup>
            <FormGroup label="Date">
              <Input type="date" value={form.rec_date} onChange={e => setForm({...form, rec_date: e.target.value})} />
            </FormGroup>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 15, marginBottom: 10 }}>
            <FormGroup label="CMP"><Input type="number" step="0.01" value={form.cmp} onChange={e => setForm({...form, cmp: e.target.value})} /></FormGroup>
            <FormGroup label="Stop Loss"><Input type="number" step="0.01" value={form.stop_loss} onChange={e => setForm({...form, stop_loss: e.target.value})} /></FormGroup>
            <FormGroup label="Target"><Input type="number" step="0.01" value={form.target} onChange={e => setForm({...form, target: e.target.value})} /></FormGroup>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 15, marginBottom: 10 }}>
            <FormGroup label="Time Period">
              <Select value={form.time_period} onChange={e => setForm({...form, time_period: e.target.value})}>
                <option>Long Term</option>
                <option>Short Term</option>
                <option>Intraday</option>
              </Select>
            </FormGroup>
            <FormGroup label="Description (max 255 chars)">
              <Input maxLength={255} value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
            </FormGroup>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn sm" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn sm primary" onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      )}

      {loading ? <div className="state">Loading...</div> : (
        recs.length === 0 ? <div className="state">No recommendations yet.</div> : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Recommender</th>
                <th>CMP / SL / TGT</th>
                <th>Period</th>
              </tr>
            </thead>
            <tbody>
              {recs.map(r => (
                <tr key={r.id}>
                  <td>{r.rec_date}</td>
                  <td><b>{r.recommender}</b></td>
                  <td>
                    {r.cmp ? `₹${r.cmp}` : '-'} / {r.stop_loss ? `₹${r.stop_loss}` : '-'} / {r.target ? `₹${r.target}` : '-'}
                  </td>
                  <td>{r.time_period}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
      {ToastContainer}
    </Modal>
  )
}
