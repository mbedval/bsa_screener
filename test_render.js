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

// We can't easily run JSX in raw node without babel.
