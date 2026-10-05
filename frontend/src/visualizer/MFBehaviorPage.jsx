import React, { useState } from 'react';
import { Search } from 'lucide-react';
import MFBehaviorModule from './MFBehaviorModule';
import FIIBehaviorModule from './FIIBehaviorModule';
import TickerTypeahead from './TickerTypeahead';

export default function MFBehaviorPage() {
  const [ticker, setTicker] = useState('RELIANCE');
  const [activeTicker, setActiveTicker] = useState('RELIANCE');

  const handleSearch = (e) => {
    e.preventDefault();
    if (ticker.trim()) {
      setActiveTicker(ticker.trim().toUpperCase());
    }
  };

  return (
    <div className="dashboard" style={{ padding: '20px' }}>
      <div style={{ background: 'rgba(30,41,59,0.7)', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', marginBottom: 24 }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
            <TickerTypeahead
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              onSelect={(selected) => setActiveTicker(selected.toUpperCase())}
            />
          </div>
          <button type="submit" style={{ padding: '10px 20px', background: '#38bdf8', color: '#0f172a', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
            Analyze
          </button>
        </form>
      </div>

      {activeTicker && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <MFBehaviorModule ticker={activeTicker} />
          <FIIBehaviorModule ticker={activeTicker} />
        </div>
      )}
    </div>
  );
}
