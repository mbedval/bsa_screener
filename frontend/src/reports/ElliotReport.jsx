import React, { useState, useEffect, useMemo } from 'react';
import { Download, Search, Filter, TrendingUp, TrendingDown, Eye, X } from 'lucide-react';
import { PurePatternDiagram } from '../visualizer/index.jsx';

export default function ElliotReport({ apiBase, onSelectTicker }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSignal, setSelectedSignal] = useState('ALL');
  const [selectedWave, setSelectedWave] = useState('ALL');

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [popupPatternModal, setPopupPatternModal] = useState(null);

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

  // Extract unique signals and waves for dropdown options
  const signalOptions = useMemo(() => {
    const set = new Set();
    data.forEach(item => {
      if (item.overall_signal) set.add(item.overall_signal);
    });
    return ['ALL', ...Array.from(set)];
  }, [data]);

  const waveOptions = useMemo(() => {
    const set = new Set();
    data.forEach(item => {
      if (item.current_wave) set.add(item.current_wave);
    });
    return ['ALL', ...Array.from(set)];
  }, [data]);

  // Filtered dataset based on Search, Signal, and Wave
  const filteredData = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return data.filter(row => {
      const matchesSearch = !term || 
        (row.ticker && row.ticker.toLowerCase().includes(term)) ||
        (row.company_name && row.company_name.toLowerCase().includes(term));
      
      const matchesSignal = selectedSignal === 'ALL' || row.overall_signal === selectedSignal;
      const matchesWave = selectedWave === 'ALL' || row.current_wave === selectedWave;
      
      return matchesSearch && matchesSignal && matchesWave;
    });
  }, [data, searchTerm, selectedSignal, selectedWave]);

  // Reset pagination when filters change
  useEffect(() => {
    setPage(1);
  }, [searchTerm, selectedSignal, selectedWave]);

  const handleDownloadCSV = () => {
    if (filteredData.length === 0) return;
    const headers = ['Ticker', 'Company Name', 'Sector', 'Wave', 'Weekly Prob (%)', 'Intraday Prob (%)', 'Close Price', 'Predicted Target', 'Projected Move (%)', 'Trade Date', 'Signal', 'Technical Score'];
    const rows = filteredData.map(row => {
      const upPct = row.upside_pct != null ? Number(row.upside_pct) : null;
      const moveStr = upPct != null ? (upPct >= 0 ? `+${upPct.toFixed(2)}%` : `${upPct.toFixed(2)}%`) : '';
      return [
        `"${row.ticker ?? ''}"`,
        `"${row.company_name ?? ''}"`,
        `"${row.sector ?? ''}"`,
        `"${row.current_wave ?? ''}"`,
        `"${row.weekly_probability != null ? Number(row.weekly_probability).toFixed(1) : ''}"`,
        `"${row.intraday_probability != null ? Number(row.intraday_probability).toFixed(1) : ''}"`,
        `"${row.close != null ? Number(row.close).toFixed(2) : ''}"`,
        `"${row.predicted_price != null ? Number(row.predicted_price).toFixed(2) : ''}"`,
        `"${moveStr}"`,
        `"${row.trade_date ?? ''}"`,
        `"${row.overall_signal ?? ''}"`,
        `"${row.technical_score != null ? row.technical_score : ''}"`
      ].join(',');
    });
    const csv = `${headers.join(',')}\n${rows.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'elliot_recommendations.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = filteredData.slice((page - 1) * pageSize, page * pageSize);

  if (loading) return <div className="state">Loading Elliot Recommendations...</div>;

  return (
    <div>
      {/* Header & Main Toolbar */}
      <div className="master-toolbar" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <span className="eyebrow">ELLIOT WAVE RECOMMENDATIONS ({filteredData.length} records)</span>
        </div>

        {/* Filters & Actions Group */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search Ticker / Company */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search ticker or name..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                paddingLeft: 30,
                paddingRight: 10,
                paddingTop: 6,
                paddingBottom: 6,
                borderRadius: 6,
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: '#1e293b',
                color: '#fff',
                fontSize: 13,
                width: 200
              }}
            />
          </div>

          {/* Signal Wise Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Filter size={14} style={{ color: '#94a3b8' }} />
            <select
              value={selectedSignal}
              onChange={e => setSelectedSignal(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: '#1e293b',
                color: '#fff',
                fontSize: 13
              }}
            >
              <option value="ALL">All Signals</option>
              {signalOptions.filter(s => s !== 'ALL').map(sig => (
                <option key={sig} value={sig}>{sig}</option>
              ))}
            </select>
          </div>

          {/* Wave Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select
              value={selectedWave}
              onChange={e => setSelectedWave(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: '#1e293b',
                color: '#fff',
                fontSize: 13
              }}
            >
              <option value="ALL">All Waves</option>
              {waveOptions.filter(w => w !== 'ALL').map(wave => (
                <option key={wave} value={wave}>{wave}</option>
              ))}
            </select>
          </div>

          {/* Download CSV */}
          <button className="btn primary" onClick={handleDownloadCSV}>
            <Download size={14} /> Download CSV
          </button>
        </div>
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
                <th>Predicted Target</th>
                <th>Projected Move</th>
                <th>Signal</th>
                <th style={{ textAlign: 'center' }}>Explicit Chart</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((row, i) => {
                const moveVal = row.upside_pct != null ? Number(row.upside_pct) : null;
                const isPositive = moveVal != null && moveVal >= 0;

                // Map Elliot Wave recommendation row into pattern object contract for PurePatternDiagram
                const patternObj = {
                  id: `elliot-${row.ticker}-${i}`,
                  ticker: row.ticker,
                  pattern_name: `Elliott Wave (${row.current_wave || 'Wave 3/5'})`,
                  pattern_code: 'elliott_wave_3',
                  category: row.overall_signal?.includes('BUY') || isPositive ? 'BULLISH' : 'BEARISH',
                  high_price: row.predicted_price != null ? row.predicted_price : row.close,
                  low_price: row.close != null ? (row.close * 0.94) : null,
                  close_price: row.close,
                  detected_date: row.trade_date || 'Live Wave',
                  strength_score: row.weekly_probability || row.technical_score || 90
                };

                return (
                  <tr key={i}>
                    <td 
                      onClick={() => onSelectTicker && onSelectTicker(row.ticker)}
                      style={{ cursor: 'pointer', color: '#7ec8f0', fontWeight: 'bold' }}
                    >
                      {row.ticker}
                    </td>
                    <td>
                      {row.company_name?.length > 20 ? `${row.company_name.substring(0, 16)}...` : (row.company_name || '-')}
                    </td>
                    <td>{row.sector || '-'}</td>
                    <td><span className="badge">{row.current_wave}</span></td>
                    <td>{row.weekly_probability != null ? `${Number(row.weekly_probability).toFixed(1)}%` : '-'}</td>
                    <td>{row.intraday_probability != null ? `${Number(row.intraday_probability).toFixed(1)}%` : '-'}</td>
                    <td>{row.close != null ? Number(row.close).toFixed(2) : '-'}</td>
                    <td style={{ fontWeight: 'bold', color: isPositive ? '#38bdf8' : '#f43f5e' }}>
                      {row.predicted_price != null ? Number(row.predicted_price).toFixed(2) : '-'}
                    </td>
                    <td>
                      {moveVal != null ? (
                        <span className={`badge ${isPositive ? 'positive' : 'negative'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {isPositive ? `+${moveVal.toFixed(1)}%` : `${moveVal.toFixed(1)}%`}
                        </span>
                      ) : '-'}
                    </td>
                    <td>
                      <span className={`badge ${row.overall_signal?.includes('BUY') ? 'positive' : row.overall_signal?.includes('SELL') ? 'negative' : ''}`}>
                        {row.overall_signal || '-'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => setPopupPatternModal(patternObj)}
                        style={{
                          background: 'rgba(56, 189, 248, 0.15)',
                          color: '#38bdf8',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          borderRadius: 4,
                          padding: '3px 8px',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          transition: 'all 0.15s ease'
                        }}
                        title="Launch dedicated vector pattern visualizer for this Elliott Wave recommendation"
                      >
                        <Eye size={12} />
                        <span>View Chart</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {paginatedData.length === 0 && (
                <tr>
                  <td colSpan="11" style={{ textAlign: 'center' }}>No matching Elliot wave recommendations found.</td>
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
              <option value={filteredData.length || 1}>All</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>◄ Prev</button>
            <span>Page {page} of {totalPages === 0 ? 1 : totalPages}</span>
            <button disabled={page >= totalPages || totalPages === 0} onClick={() => setPage(page + 1)}>Next ►</button>
          </div>
        </div>
      </section>

      {/* Dedicated Vector Pattern Chart Modal Popover */}
      {popupPatternModal && (
        <div
          className="modal-backdrop"
          onClick={() => setPopupPatternModal(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(5, 9, 18, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 960,
              backgroundColor: '#0f172a',
              borderRadius: 14,
              border: '1px solid rgba(56, 189, 248, 0.3)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '92vh',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: '#090d16',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: '#f8fafc', fontFamily: "'DM Mono'" }}>
                  {popupPatternModal.ticker} — {popupPatternModal.pattern_name}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: popupPatternModal.category === 'BULLISH' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)', color: popupPatternModal.category === 'BULLISH' ? '#4ade80' : '#f87171' }}>
                  {popupPatternModal.category}
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: "'DM Mono'" }}>
                  Detected Date: {popupPatternModal.detected_date}
                </span>
              </div>
              <button
                onClick={() => setPopupPatternModal(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#94a3b8',
                  borderRadius: 6,
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body Pure Vector Pattern Diagram */}
            <div style={{ padding: 20, overflowY: 'auto' }}>
              <PurePatternDiagram pattern={popupPatternModal} ticker={popupPatternModal.ticker} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
