import React, { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';

// Global cache so we don't fetch tickers multiple times if component unmounts/remounts
let globalTickersCache = null;

export default function TickerTypeahead({ value, onChange, onSelect, placeholder = "Enter ticker symbol (e.g. RELIANCE)", style, inputStyle }) {
  const [tickers, setTickers] = useState(globalTickersCache || []);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (globalTickersCache) return;
    fetch('/api/intelligence/research/tickers')
      .then(res => res.json())
      .then(data => {
        if (data.tickers) {
          globalTickersCache = data.tickers;
          setTickers(data.tickers);
        }
      })
      .catch(err => console.error("Failed to load tickers for typeahead", err));
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredTickers = value.trim() === '' ? [] : tickers.filter(t => 
    t.ticker.toLowerCase().includes(value.toLowerCase()) || 
    (t.company_name && t.company_name.toLowerCase().includes(value.toLowerCase()))
  ).sort((a, b) => {
    const v = value.toLowerCase();
    const aTicker = a.ticker.toLowerCase();
    const bTicker = b.ticker.toLowerCase();
    
    if (aTicker === v && bTicker !== v) return -1;
    if (bTicker === v && aTicker !== v) return 1;
    
    const aStarts = aTicker.startsWith(v);
    const bStarts = bTicker.startsWith(v);
    if (aStarts && !bStarts) return -1;
    if (bStarts && !aStarts) return 1;
    
    return aTicker.localeCompare(bTicker);
  }).slice(0, 8); // Max 8 suggestions

  const handleKeyDown = (e) => {
    if (!showDropdown || filteredTickers.length === 0) {
      if (e.key === 'Enter' && onSelect) {
        onSelect(value);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev < filteredTickers.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < filteredTickers.length) {
        const selected = filteredTickers[activeIndex].ticker;
        onChange({ target: { value: selected } });
        setShowDropdown(false);
        if (onSelect) onSelect(selected);
      } else {
        setShowDropdown(false);
        if (onSelect) onSelect(value);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const defaultInputStyle = {
    width: '100%',
    padding: '10px 10px 10px 40px',
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    ...inputStyle
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', ...style }}>
      <Search size={18} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8', zIndex: 2, pointerEvents: 'none' }} />
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e);
          setShowDropdown(true);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (value.trim() !== '') setShowDropdown(true);
        }}
        placeholder={placeholder}
        style={defaultInputStyle}
        autoComplete="off"
        spellCheck="false"
      />
      
      {showDropdown && filteredTickers.length > 0 && (
        <ul style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#0f172a',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 8,
          padding: 0,
          margin: '4px 0 0 0',
          listStyle: 'none',
          zIndex: 9999,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          overflow: 'hidden'
        }}>
          {filteredTickers.map((item, index) => (
            <li
              key={item.ticker}
              onClick={() => {
                onChange({ target: { value: item.ticker } });
                setShowDropdown(false);
                if (onSelect) onSelect(item.ticker);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              style={{
                padding: '10px 16px',
                cursor: 'pointer',
                background: index === activeIndex ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: index < filteredTickers.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none'
              }}
            >
              <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: 14 }}>{item.ticker}</span>
              <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60%' }}>
                {item.company_name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
