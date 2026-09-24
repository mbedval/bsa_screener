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
    setLoading(true);
    // Note: SearchDetailPage uses /api/ticker-master-search which might be routed through main router
    // Or if it's intelligence dataset, we can just use the same URL path
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

  const hhhlInsight = data?.hhhl_insight || null;
  const history = hhhlInsight?.historical_cycles || [];

  const totalPages = Math.ceil(history.length / pageSize);
  const paginatedData = pageSize > 0 ? history.slice((page - 1) * pageSize, page * pageSize) : history;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, alignItems: 'center' }}>
        <div className="brand">
          <h2 style={{ margin: 0 }}>HHHL Full Historical Report</h2>
          <p className="eyebrow" style={{ margin: 0, marginTop: 4 }}>Detailed historical cycles</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input 
            type="text" 
            value={searchInput} 
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search ticker..."
            style={{ padding: '6px 12px', borderRadius: 4, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
          />
          <button onClick={handleSearch} className="btn primary"><Search size={14}/> Search</button>
        </div>
      </div>
      
      {loading ? <div className="state">Loading {ticker}...</div> : error ? <div className="state error">{error}</div> : !data ? null : (
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
                    <td>{cyc.start_date} to {cyc.end_date}</td>
                    <td>₹{cyc.start_price?.toFixed(2)} → ₹{cyc.end_price?.toFixed(2)}</td>
                    <td>{cyc.total_days} Days</td>
                    <td>{cyc.max_streak} Days</td>
                    <td style={{ fontSize: 11, color: '#94a3b8' }}>{cyc.details}</td>
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
