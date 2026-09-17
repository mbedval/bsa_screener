// popup.js - Interactive script for Kite Pattern Radar extension popup

document.addEventListener('DOMContentLoaded', async () => {
  const latestContentEl = document.getElementById('latestContent');
  const openHubBtn = document.getElementById('openHubBtn');

  // Request latest detection status from background service worker
  try {
    const data = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    if (data && data.lastPattern) {
      const p = data.lastPattern;
      const catClass = p.category === 'BULLISH' ? 'bullish' : 'bearish';
      latestContentEl.innerHTML = `
        <div class="pattern-row">
          <span class="ticker">${p.ticker}</span>
          <span class="badge ${catClass}">${p.pattern_name}</span>
        </div>
        <div style="font-size: 11px; color: #cbd5e1; margin-top: 4px;">${p.description}</div>
        <div class="time">Detected at ${p.trigger_time || p.timestamp}</div>
      `;
    }
  } catch (err) {
    console.warn('Could not fetch status:', err);
  }

  // Open BSA Screener Live Pattern Hub client page
  openHubBtn.addEventListener('click', async () => {
    // Check if user has an active tab open on the BSA app port 8000 or 5173
    const tabs = await chrome.tabs.query({ url: ['*://*:8000/*', '*://*:5173/*', '*://localhost/*'] });
    if (tabs && tabs.length > 0) {
      const currentUrl = new URL(tabs[0].url);
      currentUrl.hash = 'live_pattern_hub';
      await chrome.tabs.update(tabs[0].id, { active: true, url: currentUrl.toString() });
    } else {
      // Fallback default
      await chrome.tabs.create({ url: 'http://192.168.1.14:8000/intelligence#live_pattern_hub' });
    }
  });
});
