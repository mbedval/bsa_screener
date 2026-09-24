import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

export default function ElliotReport({ apiBase, onSelectTicker }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    fetch(`${apiBase}/reports/elliot`)
      .then(res => res.json())
      .then(d => {
        setData(d.data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [apiBase]);

  const handleDownloadCSV = () => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => Object.values(row).map(v => `"${v ?? ''}"`).join(',')).join('\n');
    const csv = `${headers}\n${rows}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'elliot_recommendations.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(data.length / pageSize);
  const paginatedData = data.slice((page - 1) * pageSize, page * pageSize);

  if (loading) return <div className="state">Loading Elliot Recommendations...</div>;

  return (
    <div>
      <div className="master-toolbar" style={{ marginBottom: 16 }}>
        <span className="eyebrow">ELLIOT WAVE RECOMMENDATIONS (TOP 30)</span>
        <button className="btn primary" onClick={handleDownloadCSV}>
          <Download size={14} /> Download CSV
        </button>
      </div>

      <section className="panel data-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Company Name</th>
                <th>Sector</th>
                <th>Wave</th>
                <th>Weekly Prob (%)</th>
                <th>Intraday Prob (%)</th>
                <th>Close Price</th>
                <th>Signal</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((row, i) => (
                <tr key={i}>
                  <td 
                    onClick={() => onSelectTicker && onSelectTicker(row.ticker)}
                    style={{ cursor: 'pointer', color: '#7ec8f0', fontWeight: 'bold' }}
                  >
                    {row.ticker}
                  </td>
                  <td title={row.company_name}>
                    {row.company_name?.length > 20 ? row.company_name.substring(0, 16) + '...' : row.company_name}
                  </td>
                  <td>{row.sector}</td>
                  <td><span className="badge">{row.current_wave}</span></td>
                  <td>{row.weekly_probability?.toFixed(1)}%</td>
                  <td>{row.intraday_probability?.toFixed(1)}%</td>
                  <td>{row.close != null ? Number(row.close).toFixed(2) : '-'}</td>
                  <td><span className={`badge ${row.overall_signal?.includes('BUY') ? 'positive' : ''}`}>{row.overall_signal}</span></td>
                </tr>
              ))}
              {paginatedData.length === 0 && (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center' }}>No Elliot wave setups found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
          <div>
            <span style={{ marginRight: '10px' }}>Page Size:</span>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={data.length}>All</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>◄ Prev</button>
            <span>Page {page} of {totalPages === 0 ? 1 : totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next ►</button>
          </div>
        </div>
      </section>
    </div>
  );
}
