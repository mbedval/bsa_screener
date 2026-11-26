import React, { useEffect, useState, useRef } from 'react';
import { createChart, ColorType, AreaSeries } from 'lightweight-charts';

export default function FIIBehaviorModule({ ticker }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const chartContainerRef = useRef(null);
  const chartInstanceRef = useRef(null);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/intelligence/research/fii-behavior/${ticker}`);
        const json = await res.json();
        if (active && json.success) {
          const parsed = typeof json.data === 'string' ? JSON.parse(json.data) : json.data;
          setData(parsed);
        } else if (active) {
          setData({ error: json.detail || json.message || "Failed to load data" });
        }
      } catch (err) {
        if (active) setData({ error: err.message });
      } finally {
        if (active) setLoading(false);
      }
    };
    if (ticker) {
      fetchData();
    }
    return () => { active = false; };
  }, [ticker]);

  useEffect(() => {
    if (!chartContainerRef.current || !data?.historical_chart?.length) return;

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#94a3b8', fontSize: 12 },
      grid: { vertLines: { color: 'rgba(255,255,255,0.05)' }, horzLines: { color: 'rgba(255,255,255,0.05)' } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.1)' },
    });
    chartInstanceRef.current = chart;

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: '#38bdf8', topColor: 'rgba(56,189,248,0.4)', bottomColor: 'rgba(56,189,248,0.0)', lineWidth: 2,
    });
    
    // Sort historical chart data by date in ascending order (required by lightweight-charts)
    const chartData = [...data.historical_chart].sort((a, b) => new Date(a.time) - new Date(b.time));
    areaSeries.setData(chartData);
    chart.timeScale().fitContent();

    const handleResize = () => { if (chartContainerRef.current) chart.applyOptions({ width: chartContainerRef.current.clientWidth }); };
    window.addEventListener('resize', handleResize);
    
    return () => { window.removeEventListener('resize', handleResize); chart.remove(); };
  }, [data]);

  const cardStyle = {
    background: 'linear-gradient(145deg, rgba(30,41,59,0.7), rgba(15,23,42,0.8))',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 20,
    marginTop: 20
  };

  const badgeStyle = (color, bg) => ({
    display: 'inline-block',
    padding: '4px 10px',
    borderRadius: 20,
    fontSize: 12,
    color,
    background: bg,
    border: `1px solid ${color}40`,
    whiteSpace: 'nowrap'
  });

  const getChangeColor = (val) => {
    if (val === null || val === undefined) return '#94a3b8';
    return val > 0 ? '#10b981' : val < 0 ? '#ef4444' : '#94a3b8';
  };

  const formatChange = (val) => {
    if (val === null || val === undefined) return '—';
    const num = Number(val);
    if (isNaN(num)) return '—';
    return `${num > 0 ? '+' : ''}${num.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <div style={cardStyle}>
        <div style={{ color: '#94a3b8', textAlign: 'center', padding: 20 }}>Loading FII data for {ticker}...</div>
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div style={cardStyle}>
        <div style={{ color: '#94a3b8', textAlign: 'center', padding: 30 }}>
          <div style={{ fontSize: 24, marginBottom: 10 }}>⚠️</div>
          <div>{data?.error || "No FII behavioral data available for this ticker."}</div>
          <div style={{ fontSize: 12, marginTop: 10, color: '#64748b' }}>Make sure to run `--mode mutualfund` and `--mode analyze-all` to populate the dataset.</div>
        </div>
      </div>
    );
  }

  const { changes = {}, breadth = {}, concentration_pct, trend, insights, current_weight, latest_date, top_holders } = data;

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
            🌍 Historical FII Behaviour
          </h3>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            Historical trends and foreign institutional accumulation/distribution for {ticker}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={badgeStyle('#10b981', 'rgba(16,185,129,0.1)')}>Trend: <b>{trend || '—'}</b></span>
          <span style={badgeStyle('#a855f7', 'rgba(168,85,247,0.1)')}>Data: <b>{latest_date || '—'}</b></span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 8 }}>
          <div style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', marginBottom: 8 }}>Current FII Share</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#38bdf8' }}>{current_weight != null ? Number(current_weight).toFixed(2) : '—'}%</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 13 }}>
            <div><span style={{ color: '#64748b' }}>3M:</span> <span style={{ color: getChangeColor(changes?.['3M']) }}>{formatChange(changes?.['3M'])}</span></div>
            <div><span style={{ color: '#64748b' }}>6M:</span> <span style={{ color: getChangeColor(changes?.['6M']) }}>{formatChange(changes?.['6M'])}</span></div>
            <div><span style={{ color: '#64748b' }}>1Y:</span> <span style={{ color: getChangeColor(changes?.['12M']) }}>{formatChange(changes?.['12M'])}</span></div>
          </div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 8 }}>
          <div style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', marginBottom: 8 }}>Holder Breadth</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc' }}>{breadth?.active_schemes ?? '—'}</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>Active Schemes</div>
          </div>
          <div style={{ marginTop: 10, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#10b981' }}>Accumulating</span><span>{breadth?.accumulating ?? 0} ({breadth?.acc_breadth_pct ?? 0}%)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#ef4444' }}>Distributing</span><span>{breadth?.distributing ?? 0} ({breadth?.dist_breadth_pct ?? 0}%)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Stable</span><span>{breadth?.stable ?? 0}</span>
            </div>
          </div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 8 }}>
          <div style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', marginBottom: 8 }}>Flows & Concentration</div>
          <div style={{ marginTop: 10, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#38bdf8' }}>New Entrants</span><span style={{ fontWeight: 600 }}>{breadth?.new_entrants ?? 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#f59e0b' }}>Total Exits</span><span style={{ fontWeight: 600 }}>{breadth?.exited ?? 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: '#cbd5e1' }}>Top 3 Holder Share</span><span style={{ fontWeight: 600 }}>{concentration_pct ?? '—'}%</span>
            </div>
          </div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 8 }}>
          <div style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', marginBottom: 8 }}>Top 3 Holding Funds</div>
          <div style={{ marginTop: 10, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {top_holders && top_holders.length > 0 ? (
              top_holders.map((holder, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }} title={holder.name}>
                    {holder.name}
                  </span>
                  <span style={{ fontWeight: 600, color: '#38bdf8' }}>{holder.weight}%</span>
                </div>
              ))
            ) : (
              <span style={{ color: '#64748b' }}>No data</span>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', marginBottom: 8 }}>Historical Holding Percentage</div>
        <div ref={chartContainerRef} style={{ width: '100%', height: 250, background: 'rgba(0,0,0,0.3)', borderRadius: 8 }}></div>
      </div>

      {insights && insights.length > 0 && (
        <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: 16, borderRadius: 8 }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: 14, color: '#38bdf8' }}>Key Observations</h4>
          <ul style={{ margin: 0, paddingLeft: 20, color: '#cbd5e1', fontSize: 13, lineHeight: '1.6' }}>
            {insights.map((insight, idx) => (
              <li key={idx} style={{ marginBottom: 4 }}>{insight}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
