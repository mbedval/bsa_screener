import React from 'react';
import { renderToString } from 'react-dom/server';
import MFBehaviorModule from './frontend/src/visualizer/MFBehaviorModule.jsx';

const mockData = {
  "latest_date": "2026-09-01",
  "current_weight": 28.64,
  "changes": {
    "1M": 0.55,
    "3M": 3.04,
    "6M": 4.67,
    "12M": 7.94
  },
  "breadth": {
    "active_schemes": 7,
    "accumulating": 3,
    "distributing": 1,
    "stable": 3,
    "new_entrants": 0,
    "exited": 0,
    "acc_breadth_pct": 42.86,
    "dist_breadth_pct": 14.29
  },
  "concentration_pct": 69.27,
  "trend": "Accumulation Trend",
  "historical_chart": [
    { "time": "2025-09-01", "value": 20.7 }
  ],
  "insights": [
    "MF ownership changed from 23.97% to 28.64% over the last 6 months."
  ]
};

function TestWrapper() {
  // We need to bypass the fetch and useEffect.
  // We can just render the JSX directly with mock data.
  const data = mockData;
  const { changes, breadth, concentration_pct, trend, insights, current_weight, latest_date } = data;

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
    return `${val > 0 ? '+' : ''}${val.toFixed(2)}%`;
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 10, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
            📊 Historical Mutual Fund Behaviour
          </h3>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
            Historical trends and institutional accumulation/distribution for RELIANCE
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={badgeStyle('#10b981', 'rgba(16,185,129,0.1)')}>Trend: <b>{trend}</b></span>
          <span style={badgeStyle('#a855f7', 'rgba(168,85,247,0.1)')}>Data: <b>{latest_date}</b></span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 8 }}>
          <div style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', marginBottom: 8 }}>Current MF Share</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#38bdf8' }}>{current_weight.toFixed(2)}%</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 13 }}>
            <div><span style={{ color: '#64748b' }}>1M:</span> <span style={{ color: getChangeColor(changes['1M']) }}>{formatChange(changes['1M'])}</span></div>
            <div><span style={{ color: '#64748b' }}>3M:</span> <span style={{ color: getChangeColor(changes['3M']) }}>{formatChange(changes['3M'])}</span></div>
            <div><span style={{ color: '#64748b' }}>6M:</span> <span style={{ color: getChangeColor(changes['6M']) }}>{formatChange(changes['6M'])}</span></div>
            <div><span style={{ color: '#64748b' }}>1Y:</span> <span style={{ color: getChangeColor(changes['12M']) }}>{formatChange(changes['12M'])}</span></div>
          </div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 8 }}>
          <div style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', marginBottom: 8 }}>Holder Breadth</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc' }}>{breadth.active_schemes}</div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>Active Schemes</div>
          </div>
          <div style={{ marginTop: 10, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#10b981' }}>Accumulating</span><span>{breadth.accumulating} ({breadth.acc_breadth_pct}%)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#ef4444' }}>Distributing</span><span>{breadth.distributing} ({breadth.dist_breadth_pct}%)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Stable</span><span>{breadth.stable}</span>
            </div>
          </div>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.2)', padding: 16, borderRadius: 8 }}>
          <div style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', marginBottom: 8 }}>Flows & Concentration</div>
          <div style={{ marginTop: 10, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#38bdf8' }}>New Entrants</span><span style={{ fontWeight: 600 }}>{breadth.new_entrants}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#f59e0b' }}>Total Exits</span><span style={{ fontWeight: 600 }}>{breadth.exited}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: '#cbd5e1' }}>Top 3 Holder Share</span><span style={{ fontWeight: 600 }}>{concentration_pct}%</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase', marginBottom: 8 }}>Historical Holding Percentage</div>
        <div style={{ width: '100%', height: 250, background: 'rgba(0,0,0,0.3)', borderRadius: 8 }}></div>
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

try {
  console.log(renderToString(<TestWrapper />));
} catch (e) {
  console.error("CRASH:", e);
}
