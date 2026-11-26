import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

export default function MFAccumulationReport({ onTickerClick }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [period, setPeriod] = useState("1M");
  
  // Pagination state (UI Rule: default max 10 per page)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/intelligence/research/mf-accumulation-report?period=${period}`)
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
  }, [period]);

  const truncateText = (text) => {
    if (!text) return '—';
    if (text.length > 20) {
      return text.substring(0, 16) + '...';
    }
    return text;
  };

  const handleDownloadCSV = () => {
    if (!data || data.length === 0) return;
    const headers = ['Ticker', 'Company Name', 'Current Weight (%)', `${period} Change (%)`];
    const csvContent = [
      headers.join(','),
      ...data.map(r => `${r.ticker},"${r.company_name || ''}",${r.current_weight},${r.change_val}`)
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "mf_accumulation_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return <div style={{ padding: 20, color: '#94a3b8' }}>Loading Accumulation Report...</div>;
  if (error) return <div style={{ padding: 20, color: '#ef4444' }}>Error: {error}</div>;

  const totalPages = Math.ceil(data.length / pageSize) || 1;
  const paginatedData = data.slice((page - 1) * pageSize, page * pageSize);

  const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' };
  const thStyle = { padding: '12px 16px', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.1)' };
  const tdStyle = { padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#f8fafc' };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <select
              value={period}
              onChange={e => setPeriod(e.target.value)}
              style={{
                background: '#1e293b', color: '#f8fafc', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6, padding: '4px 8px', fontSize: 14, outline: 'none', cursor: 'pointer'
              }}
            >
              <option value="1M">1 Month</option>
              <option value="3M">3 Months</option>
              <option value="6M">6 Months</option>
              <option value="12M">12 Months</option>
            </select>
          </div>
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
              <th style={thStyle}>Current MF Weight</th>
              <th style={thStyle}>{period} Change</th>
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
                <td style={tdStyle}>
                  {row.current_weight != null ? `${Number(row.current_weight).toFixed(2)}%` : '—'}
                </td>
                <td style={{ ...tdStyle, color: '#34d399', fontWeight: 700 }}>
                  {row.change_val != null ? `+${Number(row.change_val).toFixed(2)}%` : '—'}
                </td>
              </tr>
            ))}
            {paginatedData.length === 0 && (
              <tr>
                <td colSpan="4" style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
                  No accumulation data found.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, data.length)} of {data.length} entries
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
