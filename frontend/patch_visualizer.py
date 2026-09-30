import re

with open('/home/jmbx/apps/bsa_screener/frontend/src/visualizer/index.jsx', 'r') as f:
    content = f.read()

widget = '''
            {/* Derivative History Card */}
            {data?.derivative_history && data.derivative_history.length > 0 && (
              <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 8, padding: '14px 16px', fontSize: 13, color: '#cbd5e1', lineHeight: 1.6, marginBottom: 16 }}>
                <b style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 14 }}>
                  📜 Derivative History & Lot Sizes (Last 24 Months)
                </b>
                <div style={{ display: 'grid', gap: 8 }}>
                  {data.derivative_history.map(hist => (
                    <div key={hist.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={badgeStyle(hist.action === 'ENTRY' ? '#34d399' : hist.action === 'EXIT' ? '#ef4444' : '#f59e0b', hist.action === 'ENTRY' ? 'rgba(52, 211, 153, 0.15)' : hist.action === 'EXIT' ? 'rgba(239, 68, 164, 0.15)' : 'rgba(245, 158, 11, 0.15)')}>
                          {hist.action}
                        </span>
                        <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: "'DM Mono', monospace" }}>{hist.action_date}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>Lot Size:</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', fontFamily: "'DM Mono', monospace" }}>{hist.lot_size || '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

'''

if '{/* Derivative History Card */}' not in content:
    content = content.replace('{/* Institutional Behavior Cards (Horizontal Row) */}', widget + '            {/* Institutional Behavior Cards (Horizontal Row) */}')

with open('/home/jmbx/apps/bsa_screener/frontend/src/visualizer/index.jsx', 'w') as f:
    f.write(content)
