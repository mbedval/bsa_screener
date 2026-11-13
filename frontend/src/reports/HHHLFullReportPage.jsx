import React, { useState, useEffect } from 'react';
import { Search } from 'lucide-react';

export default function HHHLFullReportPage({ apiBase, initialTicker }) {
  const [ticker, setTicker] = useState(initialTicker || 'RELIANCE');
  const [searchInput, setSearchInput] = useState(initialTicker || 'RELIANCE');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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
    let active = true;
    setLoading(true);
    setError(null);

    const base = apiBase || '/api/intelligence';
    const primaryUrl = `${base}/ticker-master-search/${encodeURIComponent(ticker)}`;
    const fallbackUrl = `/api/ticker-master-search/${encodeURIComponent(ticker)}`;

    const doFetch = async () => {
      try {
        let res = await fetch(primaryUrl).catch(() => null);
        if (!res || !res.ok) {
          res = await fetch(fallbackUrl).catch(() => null);
        }
        if (!res || !res.ok) {
          throw new Error(`Failed to load data for ${ticker}`);
        }
        const d = await res.json();
        if (!active) return;
        if (d.found === false) {
          setError(d.message || `No data found for ${ticker}`);
          setData(null);
        } else {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    };

    doFetch();
    return () => { active = false; };
  }, [ticker, apiBase]);

  const hhhlInsight = data?.hhhl_insight || null;
  let history = hhhlInsight?.historical_cycles || [];
  if (typeof history === 'string') {
    try {
      history = JSON.parse(history);
    } catch {
      history = [];
    }
  }
  if (!Array.isArray(history)) history = [];

  const totalPages = pageSize > 0 ? Math.ceil(history.length / pageSize) : 1;
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
      
      {loading ? (
        <div className="state">Loading {ticker}...</div>
      ) : error ? (
        <div className="state error">{error}</div>
      ) : !data ? null : (
        <section className="panel data-panel">
          <div className="table-wrap">
            <table style={{ background: 'rgba(0,0,0,0.15)' }}>
              <thead>
                <tr>
                  <th>Date Range</th>
                  <th>Start - End Price</th>
                  <th>Total Days</th>
                  <th>Max Streak</th>
                  <th>Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20 }}>No historical cycles detected for {ticker}.</td></tr>
                ) : paginatedData.map((cyc, idx) => (
                  <tr key={idx}>
                    <td>{cyc.start_date || '—'} to {cyc.end_date || '—'}</td>
                    <td>₹{Number(cyc.start_price != null ? cyc.start_price : 0).toFixed(2)} → ₹{Number(cyc.end_price != null ? cyc.end_price : 0).toFixed(2)}</td>
                    <td>{cyc.total_days ?? '—'} Days</td>
                    <td>{cyc.max_streak ?? '—'} Days</td>
                    <td style={{ fontSize: 11, color: '#94a3b8' }}>{cyc.details || '—'}</td>
                  </tr>
                ))}
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
                  <option value={0}>All ({history.length})</option>
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
