import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';

export default function CandlestickFullReportPage({ apiBase, initialTicker }) {
  const [ticker, setTicker] = useState(initialTicker || 'RELIANCE');
  const [searchInput, setSearchInput] = useState(initialTicker || 'RELIANCE');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const handleSearch = () => {
    if (!searchInput.trim()) return;
    setTicker(searchInput.trim().toUpperCase());
    setPage(1);
  };

  useEffect(() => {
    if (initialTicker) {
      setTicker(initialTicker.toUpperCase());
      setSearchInput(initialTicker.toUpperCase());
    }
  }, [initialTicker]);

  useEffect(() => {
    setLoading(true);
    const baseUrl = apiBase.replace('/intelligence', '');
    fetch(`${baseUrl}/ticker-master-search/${ticker}`)
      .then(r => r.json())
      .then(d => {
        if (d.found === false) {
          setError(d.message);
          setData(null);
        } else {
          setData(d);
          setError(null);
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [ticker, apiBase]);

  const history = data?.candlestick_pattern_history || [];

  const totalPages = Math.ceil(history.length / pageSize);
  const paginatedData = pageSize > 0 ? history.slice((page - 1) * pageSize, page * pageSize) : history;

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, background: 'rgba(0,0,0,0.2)', padding: '10px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>Ticker:</span>
        <input 
          type="text" 
          value={searchInput} 
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Enter ticker..."
          style={{ padding: '6px 12px', borderRadius: 4, background: '#1e293b', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 13, width: 180 }}
        />
        <button onClick={handleSearch} className="btn primary" style={{ padding: '6px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Search size={14}/> Search
        </button>
      </div>
      
      {loading ? <div className="state">Loading {ticker}...</div> : error ? <div className="state error">{error}</div> : !data ? null : (
        <section className="panel data-panel">
          <div className="table-wrap">
            <table style={{ background: 'rgba(0,0,0,0.15)' }}>
              <thead>
                <tr>
                  <th>Detected Date</th>
                  <th>Pattern Name</th>
                  <th>Timeframe</th>
                  <th>Theoretical Direction</th>
                  <th style={{ textAlign: 'right' }}>Entry Close (₹)</th>
                  <th style={{ textAlign: 'right' }}>Best Price (₹)</th>
                  <th style={{ textAlign: 'right' }}>Target Move (%)</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 20 }}>No candlestick patterns detected for {ticker}.</td></tr>
                ) : paginatedData.map((p, idx) => {
                  const isBull = p.category === 'BULLISH'
                  const isBear = p.category === 'BEARISH'
                  const catBg = isBull ? 'rgba(34, 197, 94, 0.15)' : (isBear ? 'rgba(239, 68, 68, 0.15)' : 'rgba(234, 179, 8, 0.15)')
                  const catColor = isBull ? '#4ade80' : (isBear ? '#f87171' : '#facc15')
                  const isPass = p.status === 'PASS'
                  const statusBg = isPass ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'
                  const statusColor = isPass ? '#4ade80' : '#f87171'
                  
                  return (
                    <tr key={idx}>
                      <td style={{ color: '#cbd5e1', fontFamily: "'DM Mono', monospace" }}>{p.detected_date}</td>
                      <td style={{ fontWeight: 700, color: '#f8fafc' }}>{p.pattern_name}</td>
                      <td style={{ color: '#94a3b8', fontSize: 12 }}>{p.timeframe}</td>
                      <td>
                        <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: catBg, color: catColor }}>
                          {p.category}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: "'DM Mono', monospace", color: '#cbd5e1' }}>
                        {p.entry_close_price ? Number(p.entry_close_price).toFixed(2) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: "'DM Mono', monospace", color: '#cbd5e1' }}>
                        {p.best_achieved_price ? Number(p.best_achieved_price).toFixed(2) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: "'DM Mono', monospace", color: '#cbd5e1' }}>
                        {p.target_achieved_pct ? (
                          <span style={{ color: p.target_achieved_pct > 0 ? '#4ade80' : '#f87171' }}>
                            {p.target_achieved_pct > 0 ? '+' : ''}{Number(p.target_achieved_pct).toFixed(2)}%
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: statusBg, color: statusColor }}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          
          {history.length > 0 && (
            <div className="pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', background: 'rgba(0,0,0,0.2)' }}>
              <div>
                <span style={{ marginRight: '10px', fontSize: 12 }}>Page Size:</span>
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} style={{ background: '#1a202c', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: 4 }}>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={0}>All</option>
                </select>
              </div>
              {pageSize > 0 && totalPages > 1 && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button disabled={page <= 1} onClick={() => setPage(page - 1)} style={{ cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>◄ Prev</button>
                  <span style={{ fontSize: 12 }}>Page {page} of {totalPages}</span>
                  <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} style={{ cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>Next ►</button>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
