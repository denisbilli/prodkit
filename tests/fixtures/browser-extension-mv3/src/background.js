// The assets are inside the packaged extension the browser installed.
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ groups: [] });
});
