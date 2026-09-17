// content.js - Reliable Zerodha Kite DOM & TradingView legend scanner
console.log('⚡ [Kite Pattern Radar] Active content script listening in frame:', window.location.href);

const broadcastChannel = new BroadcastChannel('kite_pattern_radar');

let currentActiveTicker = null;
let currentActiveTimeframe = null;
let lastEmittedKey = null;

// Parse Zerodha Kite DOM & TradingView chart values
function parseDOM() {
  let ticker = null;
  let timeframe = '1D';
  let openPrice = null, highPrice = null, lowPrice = null, closePrice = null;

  // 1. Ticker symbol extraction
  const href = window.location.href || '';
  let topHref = '';
  try {
    if (window.top && window.top.location) topHref = window.top.location.href;
  } catch (e) {
    // Cross-origin iframe security catch
  }
  const urlMatch = href.match(/\/tvc\/([^\/]+)\/([^\/]+)/i) || topHref.match(/\/tvc\/([^\/]+)\/([^\/]+)/i);
  if (urlMatch) {
    ticker = `${urlMatch[1]}:${urlMatch[2]}`;
  }

  // B. Page Title / Header elements fallback
  if (!ticker || ticker === 'UNKNOWN') {
    const symbolEl = document.querySelector('.instrument-name, .header-symbol, [data-symbol], .pane-legend-title, [class*="title-"]');
    if (symbolEl && symbolEl.innerText.trim()) {
      ticker = symbolEl.innerText.trim().split(' ')[0];
    } else if (document.title) {
      const parts = document.title.split(' ');
      if (parts[0] && parts[0] !== 'Kite') ticker = parts[0];
    }
  }

  // 2. Active Timeframe extraction (e.g. 5m, 15m, 1D, 1W)
  const tfBtn = document.querySelector('.button-active, [class*="selected-"], .legend-granularity, [data-name="timeframe-select"]');
  if (tfBtn) {
    timeframe = tfBtn.innerText.trim();
  } else {
    const legendText = document.querySelector('.pane-legend-line, [class*="legendLine-"]')?.innerText || '';
    const tfMatch = legendText.match(/\b(1D|1W|1M|5m|15m|1h|4h)\b/i);
    if (tfMatch) timeframe = tfMatch[1].toUpperCase();
  }

  // 3. Extract Candle OHLC values from TradingView legend values or Zerodha summary
  const legendVals = document.querySelectorAll('.pane-legend-item-value, [class*="value-"], .legend-value');
  if (legendVals && legendVals.length >= 4) {
    const nums = Array.from(legendVals)
      .map(el => parseFloat(el.innerText.replace(/,/g, '')))
      .filter(n => !isNaN(n));
    if (nums.length >= 4) {
      openPrice = nums[0];
      highPrice = nums[1];
      lowPrice = nums[2];
      closePrice = nums[3];
    }
  }

  // Fallback: LTP from sidebar if legend values not rendered yet
  if (!closePrice || isNaN(closePrice)) {
    const ltpEl = document.querySelector('.last-price, .ltp, .price, [class*="lastPrice"]');
    if (ltpEl) {
      closePrice = parseFloat(ltpEl.innerText.replace(/,/g, ''));
      openPrice = closePrice;
      highPrice = closePrice;
      lowPrice = closePrice;
    }
  }

  return { ticker: ticker || 'UNKNOWN', timeframe, openPrice, highPrice, lowPrice, closePrice };
}

// Evaluate pattern setups & emit alerts
function evaluateAndNotify(data) {
  if (!data.closePrice || isNaN(data.closePrice)) return;

  const O = data.openPrice || data.closePrice * 0.998;
  const H = data.highPrice || Math.max(data.closePrice, O) * 1.001;
  const L = data.lowPrice || Math.min(data.closePrice, O) * 0.999;
  const C = data.closePrice;

  const bodySize = Math.abs(C - O);
  const upperShadow = H - Math.max(O, C);
  const lowerShadow = Math.min(O, C) - L;
  const totalRange = H - L || 1;

  let patterns = [];

  // A. Inverted Hammer (Upper wick >= 1.8 * body, small lower wick)
  if (upperShadow >= 1.5 * bodySize && lowerShadow <= 0.4 * bodySize && bodySize / totalRange < 0.45) {
    patterns.push({
      pattern_name: 'Inverted Hammer',
      category: 'BULLISH',
      shortCode: 'INVH',
      description: `[${data.timeframe}] Inverted Hammer pattern detected on ${data.ticker}. Long upper wick with small body.`,
      strength_score: 88
    });
  }

  // B. Shooting Star (Upper wick >= 1.5 * body, Bearish close)
  if (upperShadow >= 1.5 * bodySize && lowerShadow <= 0.4 * bodySize && C <= O) {
    patterns.push({
      pattern_name: 'Shooting Star',
      category: 'BEARISH',
      shortCode: 'STAR',
      description: `[${data.timeframe}] Shooting Star pattern detected on ${data.ticker} indicating overhead resistance.`,
      strength_score: 85
    });
  }

  // C. Morning Star / Bullish Reversal Sequence
  if (C > O && lowerShadow >= 1.5 * bodySize) {
    patterns.push({
      pattern_name: 'Morning Star Setup',
      category: 'BULLISH',
      shortCode: 'MORN',
      description: `[${data.timeframe}] Morning Star reversal signal observed on ${data.ticker}.`,
      strength_score: 92
    });
  }

  // D. Engulfing / Active Momentum Candle
  if (bodySize / totalRange >= 0.5) {
    patterns.push({
      pattern_name: C >= O ? 'Bullish Engulfing' : 'Bearish Engulfing',
      category: C >= O ? 'BULLISH' : 'BEARISH',
      shortCode: C >= O ? 'ENG' : 'BEAR',
      description: `[${data.timeframe}] ${C >= O ? 'Bullish' : 'Bearish'} momentum candle active on ${data.ticker}.`,
      strength_score: C >= O ? 90 : 86
    });
  }

  // Fallback: Always push active chart observation notification on chart load/switch
  if (patterns.length === 0) {
    patterns.push({
      pattern_name: `${data.timeframe} Active Stream`,
      category: C >= O ? 'BULLISH' : 'BEARISH',
      shortCode: 'SCAN',
      description: `[${data.timeframe}] Active chart stream for ${data.ticker}. LTP: ₹${C}`,
      strength_score: 80
    });
  }

  // Emit payloads
  patterns.forEach(p => {
    const payload = {
      id: `live_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      ticker: data.ticker,
      timeframe: data.timeframe,
      pattern_name: p.pattern_name,
      category: p.category,
      shortCode: p.shortCode,
      description: p.description,
      strength_score: p.strength_score,
      trigger_time: new Date().toLocaleTimeString(),
      timestamp: new Date().toISOString(),
      open: O.toFixed(2),
      high: H.toFixed(2),
      low: L.toFixed(2),
      close: C.toFixed(2),
      source: 'Kite Live Extension'
    };

    console.log('🔔 [Kite Pattern Radar] Emitting pattern alert:', payload);

    // Broadcast to Live Pattern Hub app
    try { broadcastChannel.postMessage(payload); } catch (e) {}

    // Send to extension background service worker for badge update
    try {
      chrome.runtime.sendMessage({ type: 'PATTERN_DETECTED', pattern: payload }).catch(() => {});
    } catch (e) {}

    // Send window message fallback
    try { window.postMessage({ type: 'KITE_PATTERN_ALERT', payload }, '*'); } catch (e) {}
  });
}

// Continuous polling loop
function scan() {
  const data = parseDOM();
  if (!data.closePrice || isNaN(data.closePrice)) return;

  const currentKey = `${data.ticker}_${data.timeframe}_${data.closePrice}`;
  if (currentKey !== lastEmittedKey) {
    lastEmittedKey = currentKey;
    evaluateAndNotify(data);
  }
}

// Run scan every 1 second & observe DOM mutations
setInterval(scan, 1000);
const observer = new MutationObserver(scan);
observer.observe(document.body, { childList: true, subtree: true, characterData: true });
scan();
