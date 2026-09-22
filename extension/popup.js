const HOST_PATTERNS = ['*://*/buzz/host', '*://*/bzhost', '*://*/buzz-host.html'];
const statusEl = document.getElementById('status');

// هل صفحة التحكم مفتوحة في تبويب؟ الاختصارات لا تفيد بدونها.
chrome.tabs.query({ url: HOST_PATTERNS }).then((tabs) => {
  if (tabs && tabs.length) {
    statusEl.textContent = '✓ صفحة التحكم مفتوحة — الاختصارات جاهزة.';
    statusEl.className = 'ok';
  } else {
    statusEl.textContent = '✗ لا توجد صفحة تحكم مفتوحة. افتح /buzz/host أولًا.';
    statusEl.className = 'off';
  }
}).catch(() => {
  statusEl.textContent = 'تعذّر فحص التبويبات.';
  statusEl.className = 'off';
});

// روابط chrome:// لا تُفتح كرابط عادي — نفتحها ببرمجة.
document.getElementById('open-shortcuts').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});
