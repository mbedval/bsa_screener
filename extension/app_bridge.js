// app_bridge.js - Bridge script injected into BSA Screener web portal tab
console.log('⚡ [Kite Pattern Radar Bridge] Active content bridge listening on tab:', window.location.href);

let lastHistoryTimestamp = null;

// Function to sync history from chrome.storage.local to web page
function syncHistoryToPage() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get(['history', 'lastPattern', 'lastUpdated'], (res) => {
        if (res?.history && res.history.length > 0) {
          const latestTime = res.lastUpdated || (res.history[0] ? res.history[0].timestamp : null);
          if (latestTime !== lastHistoryTimestamp) {
            lastHistoryTimestamp = latestTime;
            window.postMessage({ type: 'KITE_INITIAL_HISTORY', payload: res.history }, '*');
          }
        }
      });
    }
  } catch (e) {}
}

// 1. Listen for background service worker push messages
try {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'KITE_PATTERN_ALERT' && message.payload) {
      window.postMessage({ type: 'KITE_PATTERN_ALERT', payload: message.payload }, '*');
      sendResponse({ status: 'relayed' });
    }
  });
} catch (e) {}

// 2. Listen for chrome storage changes
try {
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener(() => {
      syncHistoryToPage();
    });
  }
} catch (e) {}

// 3. Continuous sync backup poll every 1 second
setInterval(syncHistoryToPage, 1000);
syncHistoryToPage();
