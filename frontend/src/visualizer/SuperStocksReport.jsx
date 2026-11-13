import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

export function SuperStocksReport({ apiBase = '/api/intelligence', onTickerClick }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [minProjPct, setMinProjPct] = useState(1);

  useEffect(() => {
    setLoading(true);
    fetch(`${apiBase}/research/super-stocks-report?min_proj_pct=${minProjPct}`)
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.message || "Failed to load data.");
        }
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [apiBase, minProjPct]);

  const truncateText = (text) => {
    if (!text) return '—';
    if (text.length > 20) {
      return text.substring(0, 16) + '...';
    }
    return text;
  };

  const handleDownloadCSV = () => {
    if (!data || data.length === 0) return;
    const headers = ['Ticker', 'Company Name', 'Fundamental Score', 'Breakout Stage', 'MF 1M Change (%)', 'FII 3M Change (%)', '22D Projection (%)'];
    const csvContent = [
      headers.join(','),
      ...data.map(r => `${r.ticker},"${r.company_name || ''}",${r.fundamental_score},"${r.breakout_stage}",${r.mf_1m_change},${r.fii_3m_change},${r.projection_22d_pct}`)
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "super_stocks_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <div style={{ padding: 20, color: '#94a3b8' }}>Loading Super Stocks Report...</div>;
  if (error) return <div style={{ padding: 20, color: '#ef4444' }}>Error: {error}</div>;

  const totalPages = Math.ceil(data.length / pageSize) || 1;
  const paginatedData = data.slice((page - 1) * pageSize, page * pageSize);

  const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' };
  const thStyle = { padding: '12px 16px', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.1)' };
  const tdStyle = { padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#f8fafc' };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ color: '#f8fafc', fontSize: 24, margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
            ⭐ Super Stocks
            <select
              value={minProjPct}
              onChange={e => setMinProjPct(Number(e.target.value))}
              style={{
                background: '#1e293b', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6, padding: '4px 8px', fontSize: 14, outline: 'none', cursor: 'pointer'
              }}
            >
              <option value={5}>&gt; 5% Projection</option>
              <option value={4}>&gt; 4% Projection</option>
              <option value={3}>&gt; 3% Projection</option>
              <option value={2}>&gt; 2% Projection</option>
              <option value={1}>&gt; 1% Projection</option>
            </select>
          </h2>
          <p style={{ color: '#94a3b8', margin: 0, fontSize: 14 }}>
            Stocks exhibiting strong fundamentals, retracement breakouts, institutional accumulation (MF & FII), and &gt;{minProjPct}% short-term upside projections.
          </p>
        </div>
        <button
          onClick={handleDownloadCSV}
          style={{
            background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)',
            borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          <Download size={14} /> Download CSV
        </button>
      </div>

      <div style={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Ticker</th>
              <th style={thStyle}>Company Name</th>
              <th style={thStyle}>Fundamental Score</th>
              <th style={thStyle}>Breakout Stage</th>
              <th style={thStyle}>MF 1M Acc</th>
              <th style={thStyle}>FII 3M Acc</th>
              <th style={thStyle}>22D Proj Upside</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((row) => (
              <tr key={row.ticker} style={{ transition: 'background 0.2s' }}>
                <td style={tdStyle}>
                  <button
                    onClick={() => onTickerClick && onTickerClick(row.ticker)}
                    style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                  >
                    {row.ticker}
                  </button>
                </td>
                <td style={{ ...tdStyle, color: '#cbd5e1' }}>
                  {truncateText(row.company_name)}
                </td>
                <td style={{ ...tdStyle, color: '#f59e0b', fontWeight: 700 }}>
                  {row.fundamental_score != null ? Number(row.fundamental_score).toFixed(2) : '—'}
                </td>
                <td style={{ ...tdStyle, color: '#34d399', fontWeight: 600 }}>
                  {row.breakout_stage || '—'}
                </td>
                <td style={{ ...tdStyle, color: '#34d399' }}>
                  {row.mf_1m_change != null ? `+${Number(row.mf_1m_change).toFixed(2)}%` : '—'}
                </td>
                <td style={{ ...tdStyle, color: '#34d399' }}>
                  {row.fii_3m_change != null ? `+${Number(row.fii_3m_change).toFixed(2)}%` : '—'}
                </td>
                <td style={{ ...tdStyle, color: '#a855f7', fontWeight: 800 }}>
                  {row.projection_22d_pct != null ? `+${Number(row.projection_22d_pct).toFixed(2)}%` : '—'}
                </td>
              </tr>
            ))}
            {paginatedData.length === 0 && (
              <tr>
                <td colSpan="7" style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
                  No stocks meet the Super Stocks criteria at this time.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Showing {data.length > 0 ? ((page - 1) * pageSize) + 1 : 0} to {Math.min(page * pageSize, data.length)} of {data.length} entries
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#94a3b8' }}>
              <span>Page Size:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                style={{ background: '#1e293b', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '4px 8px', outline: 'none' }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={data.length || 1000}>All</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{ background: page === 1 ? 'transparent' : '#1e293b', color: page === 1 ? '#475569' : '#f8fafc', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: page === 1 ? 'not-allowed' : 'pointer' }}
              >
                ◄ Prev
              </button>
              <span style={{ fontSize: 12, color: '#f8fafc', padding: '4px 8px', background: 'rgba(56, 189, 248, 0.1)', borderRadius: 4, border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                style={{ background: page === totalPages ? 'transparent' : '#1e293b', color: page === totalPages ? '#475569' : '#f8fafc', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '4px 10px', fontSize: 12, cursor: page === totalPages ? 'not-allowed' : 'pointer' }}
              >
                Next ►
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
