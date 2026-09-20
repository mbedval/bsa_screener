import React from 'react';
import { renderToString } from 'react-dom/server';

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
  const data = mockData;
  const { changes, breadth, concentration_pct, trend, insights, current_weight, latest_date } = data;
  const ticker = "RELIANCE";

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

  return React.createElement('div', { style: cardStyle }, [
    React.createElement('div', { style: { display: 'flex' } }, [
      React.createElement('div', null, [
        React.createElement('h3', null, '📊 Historical Mutual Fund Behaviour'),
        React.createElement('div', null, `Historical trends and institutional accumulation/distribution for ${ticker}`)
      ]),
      React.createElement('div', null, [
        React.createElement('span', { style: badgeStyle('#10b981', 'rgba(16,185,129,0.1)') }, ['Trend: ', React.createElement('b', null, trend)]),
        React.createElement('span', { style: badgeStyle('#a855f7', 'rgba(168,85,247,0.1)') }, ['Data: ', React.createElement('b', null, latest_date)])
      ])
    ]),
    React.createElement('div', null, [
      React.createElement('div', null, [
        React.createElement('div', null, 'Current MF Share'),
        React.createElement('div', null, `${current_weight.toFixed(2)}%`),
        React.createElement('div', null, [
          React.createElement('div', null, [React.createElement('span', null, '1M:'), React.createElement('span', { style: { color: getChangeColor(changes['1M']) } }, formatChange(changes['1M']))]),
          React.createElement('div', null, [React.createElement('span', null, '3M:'), React.createElement('span', { style: { color: getChangeColor(changes['3M']) } }, formatChange(changes['3M']))]),
          React.createElement('div', null, [React.createElement('span', null, '6M:'), React.createElement('span', { style: { color: getChangeColor(changes['6M']) } }, formatChange(changes['6M']))]),
          React.createElement('div', null, [React.createElement('span', null, '1Y:'), React.createElement('span', { style: { color: getChangeColor(changes['12M']) } }, formatChange(changes['12M']))])
        ])
      ]),
      React.createElement('div', null, [
        React.createElement('div', null, 'Holder Breadth'),
        React.createElement('div', null, [
          React.createElement('div', null, breadth.active_schemes),
          React.createElement('div', null, 'Active Schemes')
        ]),
        React.createElement('div', null, [
          React.createElement('div', null, [React.createElement('span', null, 'Accumulating'), React.createElement('span', null, `${breadth.accumulating} (${breadth.acc_breadth_pct}%)`)]),
          React.createElement('div', null, [React.createElement('span', null, 'Distributing'), React.createElement('span', null, `${breadth.distributing} (${breadth.dist_breadth_pct}%)`)]),
          React.createElement('div', null, [React.createElement('span', null, 'Stable'), React.createElement('span', null, breadth.stable)])
        ])
      ]),
      React.createElement('div', null, [
        React.createElement('div', null, 'Flows & Concentration'),
        React.createElement('div', null, [
          React.createElement('div', null, [React.createElement('span', null, 'New Entrants'), React.createElement('span', null, breadth.new_entrants)]),
          React.createElement('div', null, [React.createElement('span', null, 'Total Exits'), React.createElement('span', null, breadth.exited)]),
          React.createElement('div', null, [React.createElement('span', null, 'Top 3 Holder Share'), React.createElement('span', null, `${concentration_pct}%`)])
        ])
      ])
    ]),
    React.createElement('div', null, [
      React.createElement('div', null, 'Historical Holding Percentage'),
      React.createElement('div', null)
    ]),
    insights && insights.length > 0 && React.createElement('div', null, [
      React.createElement('h4', null, 'Key Observations'),
      React.createElement('ul', null, insights.map((insight, idx) => React.createElement('li', { key: idx }, insight)))
    ])
  ]);
}

try {
  console.log(renderToString(React.createElement(TestWrapper)));
} catch (e) {
  console.error("CRASH:", e);
}
