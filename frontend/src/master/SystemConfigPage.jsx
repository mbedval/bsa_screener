import React, { useEffect, useState } from 'react'
import { Edit2, Key, Save, Server, Shield } from 'lucide-react'
import * as api from './api.js'
import { useToast, SectionHeader, FormGroup, Input } from './ui.jsx'

export default function SystemConfigPage({ dataset }) {
  const [configs, setConfigs]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [editingKey, setEditingKey] = useState(null)
  const [editValue, setEditValue]   = useState('')
  const [saving, setSaving]     = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const { show, ToastContainer } = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.systemConfig.list(dataset)
      setConfigs(data || [])
    } catch (e) {
      show(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [dataset])

  const handleStartEdit = (key, val) => {
    setEditingKey(key)
    setEditValue(val || '')
  }

  const handleSave = async (key) => {
    setSaving(true)
    try {
      await api.systemConfig.update(key, editValue, dataset)
      show(`Updated system config '${key}' successfully!`, 'success')
      setEditingKey(null)
      load()
    } catch (e) {
      show(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = async () => {
    if (!newKey.trim()) return
    setSaving(true)
    try {
      await api.systemConfig.update(newKey.trim(), newValue, dataset)
      show(`Added new config '${newKey}' successfully!`, 'success')
      setIsAdding(false)
      setNewKey('')
      setNewValue('')
      load()
    } catch (e) {
      show(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '24px 32px' }}>
      {ToastContainer}
      <SectionHeader
        title="System Configuration & Credentials"
        subtitle="Manage system-wide parameters, SMTP mail server credentials, and external API tokens."
        icon={Key}
      />

      <div style={{ marginTop: 24, backgroundColor: '#0f172a', borderRadius: 8, border: '1px solid #1e293b', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ color: '#f8fafc', margin: 0, fontSize: 16 }}>Configurations</h3>
          <button
            onClick={() => { setIsAdding(true); setEditingKey(null); }}
            style={{
              backgroundColor: '#38bdf8', color: '#0f172a', border: 'none', fontWeight: 600,
              borderRadius: 4, padding: '6px 16px', cursor: 'pointer', fontSize: 13
            }}
          >
            + Add New Setting
          </button>
        </div>
        
        {loading ? (
          <div style={{ color: '#94a3b8', padding: 16 }}>Loading system configurations...</div>
        ) : configs.length === 0 && !isAdding ? (
          <div style={{ color: '#94a3b8', padding: 16 }}>No system configuration records found.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', textAlign: 'left', fontSize: 13 }}>
                <th style={{ padding: '10px 12px' }}>Setting Key</th>
                <th style={{ padding: '10px 12px' }}>Current Value</th>
                <th style={{ padding: '10px 12px' }}>Last Updated</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isAdding && (
                <tr style={{ borderBottom: '1px solid #1e293b', backgroundColor: 'rgba(56,189,248,0.05)' }}>
                  <td style={{ padding: '12px' }}>
                    <FormGroup style={{ margin: 0 }}>
                      <Input
                        type="text"
                        value={newKey}
                        onChange={e => setNewKey(e.target.value)}
                        placeholder="e.g. gmail_cc"
                        style={{ maxWidth: 200, fontFamily: 'monospace' }}
                      />
                    </FormGroup>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <FormGroup style={{ margin: 0 }}>
                      <Input
                        type={newKey.includes('password') || newKey.includes('token') ? 'password' : 'text'}
                        value={newValue}
                        onChange={e => setNewValue(e.target.value)}
                        placeholder="Value..."
                        style={{ maxWidth: 400 }}
                      />
                    </FormGroup>
                  </td>
                  <td style={{ padding: '12px', color: '#64748b', fontSize: 12 }}>
                    —
                  </td>
                  <td style={{ padding: '12px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button
                        onClick={handleAdd}
                        disabled={saving || !newKey.trim()}
                        style={{
                          backgroundColor: '#10b981', color: '#fff', border: 'none',
                          borderRadius: 4, padding: '6px 12px', cursor: (saving || !newKey.trim()) ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, opacity: (saving || !newKey.trim()) ? 0.6 : 1
                        }}
                      >
                        <Save size={14} /> Add
                      </button>
                      <button
                        onClick={() => setIsAdding(false)}
                        style={{
                          backgroundColor: '#334155', color: '#94a3b8', border: 'none',
                          borderRadius: 4, padding: '6px 12px', cursor: 'pointer', fontSize: 13
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {configs.map(cfg => {
                const isEditing = editingKey === cfg.key
                const isSecret = cfg.key.includes('password') || cfg.key.includes('token')
                
                return (
                  <tr key={cfg.key} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '12px', color: '#38bdf8', fontWeight: 600, fontFamily: 'monospace' }}>
                      {cfg.key}
                    </td>
                    <td style={{ padding: '12px', color: '#f8fafc' }}>
                      {isEditing ? (
                        <FormGroup style={{ margin: 0 }}>
                          <Input
                            type={isSecret ? 'password' : 'text'}
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            placeholder={`Enter ${cfg.key}...`}
                            style={{ maxWidth: 400 }}
                          />
                        </FormGroup>
                      ) : (
                        <span style={{ fontFamily: 'monospace', color: cfg.value ? '#f1f5f9' : '#64748b' }}>
                          {cfg.value ? (isSecret ? '••••••••••••' : cfg.value) : '<not set>'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px', color: '#64748b', fontSize: 12 }}>
                      {cfg.updated_at || '—'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleSave(cfg.key)}
                            disabled={saving}
                            style={{
                              backgroundColor: '#10b981', color: '#fff', border: 'none',
                              borderRadius: 4, padding: '6px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13
                            }}
                          >
                            <Save size={14} /> Save
                          </button>
                          <button
                            onClick={() => setEditingKey(null)}
                            style={{
                              backgroundColor: '#334155', color: '#94a3b8', border: 'none',
                              borderRadius: 4, padding: '6px 12px', cursor: 'pointer', fontSize: 13
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleStartEdit(cfg.key, cfg.value)}
                          style={{
                            backgroundColor: '#1e293b', color: '#38bdf8', border: '1px solid #334155',
                            borderRadius: 4, padding: '6px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13
                          }}
                        >
                          <Edit2 size={14} /> Edit
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
