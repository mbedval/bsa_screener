/**
 * Shared UI primitives for master data management.
 * Provides: Modal, Toast/useToast, ConfirmDialog, Pagination,
 *           DataTable, Badge, Spinner, EmptyState, SearchBar
 */
import React, { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, X } from 'lucide-react'

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [])
  return <div className={`toast toast-${type}`} onClick={onClose}>{message}</div>
}

export function useToast() {
  const [toasts, setToasts] = useState([])
  const show = (message, type = 'success') =>
    setToasts(ts => [...ts, { message, type, id: Date.now() + Math.random() }])
  const remove = id => setToasts(ts => ts.filter(t => t.id !== id))
  const ToastContainer = (
    <div className="toast-container">
      {toasts.map(t => <Toast key={t.id} {...t} onClose={() => remove(t.id)} />)}
    </div>
  )
  return { show, ToastContainer }
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function Modal({ title, subtitle, onClose, size = 'md', children }) {
  const ref = useRef(null)
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])
  return (
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal modal-${size}`} ref={ref}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">{title}</h3>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={15}/></button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────
export function ConfirmDialog({ title, message, confirmLabel = 'Delete', onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose} size="sm">
      <div className="confirm-body">
        <AlertTriangle size={28} className="confirm-icon" />
        <p>{message}</p>
      </div>
      <div className="form-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-danger" onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button>
      </div>
    </Modal>
  )
}

// ── Pagination ────────────────────────────────────────────────────────────────
export function Pagination({ total, page, pageSize, onChange }) {
  const pages = Math.ceil(total / pageSize) || 1
  if (pages <= 1) return null
  const from = Math.min((page - 1) * pageSize + 1, total)
  const to = Math.min(page * pageSize, total)
  return (
    <div className="pagination">
      <span className="page-info">{from}–{to} of {total}</span>
      <div className="page-btns">
        <button onClick={() => onChange(1)} disabled={page === 1}><ChevronsLeft size={14}/></button>
        <button onClick={() => onChange(page - 1)} disabled={page === 1}><ChevronLeft size={14}/></button>
        <span className="page-cur">{page} / {pages}</span>
        <button onClick={() => onChange(page + 1)} disabled={page === pages}><ChevronRight size={14}/></button>
        <button onClick={() => onChange(pages)} disabled={page === pages}><ChevronsRight size={14}/></button>
      </div>
    </div>
  )
}

// ── Search Bar ────────────────────────────────────────────────────────────────
export function SearchBar({ value, onChange, onSearch, placeholder = 'Search…', children }) {
  return (
    <div className="master-search-bar">
      <div className="search">
        <Search size={15}/>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onSearch?.()}
          placeholder={placeholder}
        />
        {value && <button className="clear-btn" onClick={() => { onChange(''); onSearch?.() }}><X size={13}/></button>}
      </div>
      {children}
    </div>
  )
}

// ── Data Table ────────────────────────────────────────────────────────────────
export function DataTable({ columns, rows, onSort, sortKey, sortAsc, loading, empty = 'No records found.' }) {
  if (loading) return <div className="state"><Spinner/> Loading…</div>
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} onClick={() => col.sortable !== false && onSort?.(col.key)}
                  style={{ cursor: col.sortable !== false ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                {col.label}
                {sortKey === col.key && (sortAsc ? ' ↑' : ' ↓')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={columns.length}><div className="state">{empty}</div></td></tr>
            : rows.map((row, i) => (
                <tr key={i}>
                  {columns.map(col => (
                    <td key={col.key}>{col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}</td>
                  ))}
                </tr>
              ))
          }
        </tbody>
      </table>
    </div>
  )
}

// ── Form primitives ───────────────────────────────────────────────────────────
export function FormGroup({ label, required, hint, children }) {
  return (
    <div className="form-group">
      <label>{label}{required && <span className="req">*</span>}{hint && <small className="hint"> — {hint}</small>}</label>
      {children}
    </div>
  )
}

export function Input({ ...props }) {
  return <input className="form-input" {...props}/>
}

export function Textarea({ ...props }) {
  return <textarea className="form-input form-textarea" {...props}/>
}

export function Select({ children, ...props }) {
  return <select className="form-input" {...props}>{children}</select>
}

export function Checkbox({ label, ...props }) {
  return (
    <label className="toggle-label">
      <input type="checkbox" {...props}/>
      <span>{label}</span>
    </label>
  )
}

// ── Chips ─────────────────────────────────────────────────────────────────────
export function TickerChip({ label }) {
  return <span className="ticker-chip">{label}</span>
}

export function SectorChip({ label }) {
  return <span className="sector-chip">{label}</span>
}

export function IndexChip({ label }) {
  return <span className="index-chip">{label}</span>
}

// ── Badges ────────────────────────────────────────────────────────────────────
export function FnoBadge({ value }) {
  return value
    ? <span className="badge positive">F&O</span>
    : <span className="badge neutral">Cash</span>
}

export function CountBadge({ count }) {
  return <span className="badge-count">{count}</span>
}

// ── Misc ──────────────────────────────────────────────────────────────────────
export function Spinner() {
  return <span className="spinner"/>
}

export function EmptyState({ icon: Icon, title, action }) {
  return (
    <div className="empty-state">
      {Icon && <Icon size={36} className="empty-icon"/>}
      <p>{title}</p>
      {action}
    </div>
  )
}

export function SectionHeader({ title, sub, actions }) {
  return (
    <div className="section-header">
      <div><h2>{title}</h2>{sub && <p className="section-sub">{sub}</p>}</div>
      <div className="section-actions">{actions}</div>
    </div>
  )
}

// ── Tag input (for index_memberships) ─────────────────────────────────────────
export function TagInput({ value = [], onChange, placeholder = 'Type and press Enter…' }) {
  const [input, setInput] = useState('')
  const add = () => {
    const v = input.trim().toUpperCase()
    if (v && !value.includes(v)) { onChange([...value, v]); setInput('') }
  }
  const remove = tag => onChange(value.filter(t => t !== tag))
  return (
    <div className="tag-input-wrap">
      <div className="tag-input-tags">
        {value.map(t => (
          <span key={t} className="index-chip">
            {t}<button className="tag-remove" onClick={() => remove(t)}><X size={10}/></button>
          </span>
        ))}
        <input
          className="tag-inner-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } if (e.key === 'Backspace' && !input && value.length) onChange(value.slice(0, -1)) }}
          placeholder={value.length ? '' : placeholder}
        />
      </div>
    </div>
  )
}

// ── Multi-select picker (for sector/ticker assignment) ────────────────────────
export function MultiPicker({ items, selected, onChange, labelKey = 'name', valueKey = 'id', search = true }) {
  const [q, setQ] = useState('')
  const filtered = items.filter(i => !q || String(i[labelKey]).toLowerCase().includes(q.toLowerCase()))
  const toggle = val => onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val])
  return (
    <div className="multi-picker">
      {search && (
        <div className="multi-picker-search">
          <Search size={13}/>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter…"/>
          {q && <button onClick={() => setQ('')}><X size={12}/></button>}
        </div>
      )}
      <div className="multi-picker-list">
        {filtered.length === 0 && <div className="multi-picker-empty">No items</div>}
        {filtered.map(item => {
          const val = item[valueKey]
          const checked = selected.includes(val)
          return (
            <label key={val} className={`multi-picker-item${checked ? ' checked' : ''}`}>
              <input type="checkbox" checked={checked} onChange={() => toggle(val)} readOnly={false}/>
              <span>{item[labelKey]}</span>
              {item.count !== undefined && <CountBadge count={item.count}/>}
            </label>
          )
        })}
      </div>
      <div className="multi-picker-footer">
        <span>{selected.length} selected</span>
        <button className="link-btn" onClick={() => onChange([])}>Clear all</button>
      </div>
    </div>
  )
}
