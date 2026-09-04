import React, { useEffect, useState } from 'react'
import { Modal, FormGroup, Input, Select, useToast } from './ui.jsx'
import * as api from './api.js'

export default function AddRecommendationModal({ onClose, onSuccess }) {
  const [tickers, setTickers] = useState([])
  const [loadingTickers, setLoadingTickers] = useState(true)
  const [saving, setSaving] = useState(false)
  
  const [form, setForm] = useState({
    ticker: '',
    rec_date: new Date().toISOString().split('T')[0],
    recommender: '',
    cmp: '',
    stop_loss: '',
    target: '',
    time_period: 'Long Term',
    description: ''
  })
  
  const { show, ToastContainer } = useToast()

  useEffect(() => {
    const fetchTickers = async () => {
      try {
        const data = await api.tickers.list({})
        setTickers(data || [])
      } catch (e) {
        show('Failed to load tickers: ' + e.message, 'error')
      } finally {
        setLoadingTickers(false)
      }
    }
    fetchTickers()
  }, [])

  const submit = async () => {
    if (!form.ticker) return show('Please select a ticker', 'error')
    if (!form.recommender) return show('Recommender name is required', 'error')
    
    setSaving(true)
    try {
      const payload = {
        ticker: form.ticker,
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
      if (onSuccess) onSuccess()
      onClose()
    } catch (e) {
      show(e.message, 'error')
      setSaving(false)
    }
  }

  return (
    <Modal title="Add New Recommendation" onClose={onClose} width={600}>
      <div style={{ background: 'var(--panel-bg)', padding: 15, borderRadius: 6, marginBottom: 15, border: '1px solid var(--border)' }}>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, marginBottom: 10 }}>
          <FormGroup label="Ticker">
            <Select 
              value={form.ticker} 
              onChange={e => setForm({...form, ticker: e.target.value})}
              disabled={loadingTickers}
            >
              <option value="">-- Select Ticker --</option>
              {tickers.map(t => (
                <option key={t.ticker} value={t.ticker}>{t.ticker} - {t.company_name}</option>
              ))}
            </Select>
          </FormGroup>
          <FormGroup label="Recommender (e.g. Zerodha)">
            <Input value={form.recommender} onChange={e => setForm({...form, recommender: e.target.value})} />
          </FormGroup>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 15, marginBottom: 10 }}>
          <FormGroup label="Date">
            <Input type="date" value={form.rec_date} onChange={e => setForm({...form, rec_date: e.target.value})} />
          </FormGroup>
          <FormGroup label="CMP"><Input type="number" step="0.01" value={form.cmp} onChange={e => setForm({...form, cmp: e.target.value})} /></FormGroup>
          <FormGroup label="Time Period">
            <Select value={form.time_period} onChange={e => setForm({...form, time_period: e.target.value})}>
              <option>Long Term</option>
              <option>Short Term</option>
              <option>Intraday</option>
            </Select>
          </FormGroup>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, marginBottom: 10 }}>
          <FormGroup label="Stop Loss"><Input type="number" step="0.01" value={form.stop_loss} onChange={e => setForm({...form, stop_loss: e.target.value})} /></FormGroup>
          <FormGroup label="Target"><Input type="number" step="0.01" value={form.target} onChange={e => setForm({...form, target: e.target.value})} /></FormGroup>
        </div>
        
        <div style={{ marginBottom: 15 }}>
          <FormGroup label="Description (max 255 chars)">
            <Input maxLength={255} value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Supporting reasons..." />
          </FormGroup>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button className="btn sm" onClick={onClose}>Cancel</button>
          <button className="btn sm primary" onClick={submit} disabled={saving || loadingTickers}>{saving ? 'Saving...' : 'Save Recommendation'}</button>
        </div>
      </div>
      {ToastContainer}
    </Modal>
  )
}
