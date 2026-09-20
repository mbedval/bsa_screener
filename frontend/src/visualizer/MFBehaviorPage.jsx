import React, { useState } from 'react';
import { Search } from 'lucide-react';
import MFBehaviorModule from './MFBehaviorModule';

export default function MFBehaviorPage() {
  const [ticker, setTicker] = useState('');
  const [activeTicker, setActiveTicker] = useState('');

  const handleSearch = (e) => {
    e.preventDefault();
    if (ticker.trim()) {
      setActiveTicker(ticker.trim().toUpperCase());
    }
  };

  return (
    <div className="dashboard" style={{ padding: '20px' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ color: '#f8fafc', fontSize: 24, margin: '0 0 10px 0' }}>Historical Mutual Fund Behaviour</h2>
        <p style={{ color: '#94a3b8', margin: 0 }}>
          Search for a stock symbol to view institutional accumulation and distribution trends over time.
        </p>
      </div>

      <div style={{ background: 'rgba(30,41,59,0.7)', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
            <Search size={18} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Enter ticker symbol (e.g. RELIANCE)"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 10px 10px 40px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#fff',
                fontSize: 14,
                outline: 'none'
              }}
            />
          </div>
          <button type="submit" style={{ padding: '10px 20px', background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
            Analyze
          </button>
        </form>
      </div>

      {activeTicker && (
        <MFBehaviorModule ticker={activeTicker} />
      )}
    </div>
  );
}
