// background.js - Service worker for Kite Pattern Radar

// Handle message listeners for state & badge updates
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === 'PATTERN_DETECTED') {
      const { pattern } = message;
      
      // Save pattern in storage history (this triggers chrome.storage.onChanged in app tabs!)
      const { history = [] } = await chrome.storage.local.get('history');
      const updatedHistory = [pattern, ...history].slice(0, 50); // Keep last 50
      await chrome.storage.local.set({ 
        history: updatedHistory,
        lastPattern: pattern,
        lastUpdated: new Date().toLocaleTimeString(),
        broadcastPing: Date.now() // Force change event every time
      });

      // Update badge color and text based on pattern category
      let badgeColor = '#eab308'; // Default Neutral Yellow
      if (pattern.category === 'BULLISH') {
        badgeColor = '#22c55e'; // Green
      } else if (pattern.category === 'BEARISH') {
        badgeColor = '#ef4444'; // Red
      }

      const badgeText = pattern.shortCode || 'ALERT';
      await chrome.action.setBadgeText({ text: badgeText });
      await chrome.action.setBadgeBackgroundColor({ color: badgeColor });

      // Forward message to all open tabs running the BSA web portal
      try {
        const allTabs = await chrome.tabs.query({});
        for (const tab of allTabs) {
          if (tab.id && tab.url && (tab.url.includes(':8000') || tab.url.includes(':5173') || tab.url.includes('localhost') || tab.url.includes('192.168.'))) {
            chrome.tabs.sendMessage(tab.id, { type: 'KITE_PATTERN_ALERT', payload: pattern }).catch(() => {});
          }
        }
      } catch (err) {}
      
      sendResponse({ status: 'success' });
    } else if (message.type === 'CLEAR_BADGE') {
      await chrome.action.setBadgeText({ text: '' });
      sendResponse({ status: 'cleared' });
    } else if (message.type === 'GET_STATUS') {
      const data = await chrome.storage.local.get(['history', 'lastPattern', 'lastUpdated', 'isMonitoring']);
      sendResponse(data);
    }
  })();
  return true; // Keep message channel open for async response
});

// Clear badge on extension start or tab navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url && tab.url.includes('kite.zerodha.com')) {
    chrome.action.setBadgeText({ text: 'LIVE' });
    chrome.action.setBadgeBackgroundColor({ color: '#38bdf8' });
  }
});
