// يُحقن داخل صفحة التحكم فقط. يستقبل الأمر من الخدمة الخلفية ويطلق نفس ضغطة
// المفتاح التي تنتظرها الصفحة، فيعمل منطق الاختصارات الأصلي في buzz-host.js كما لو
// أن المستخدم ضغط الزر بنفسه — بدون تكرار لأسماء الأزرار أو منطقها هنا.

const KEY_FOR = {
  Space: ' ',
  Escape: 'Escape',
  Enter: 'Enter',
  KeyN: 'n',
  KeyA: 'a',
  KeyH: 'h',
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
  Digit5: '5',
  Digit0: '0',
};

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'hroof-shortcut') return;
  const code = msg.code;

  // نطلقها على body لا على document: مُعالِج الصفحة يقرأ e.target.closest(...)،
  // و body يُرجع null فيمرّ الاختصار، بينما document لا يملك closest.
  const target = document.body || document.documentElement;
  if (!target) return;

  const ev = new KeyboardEvent('keydown', {
    code,
    key: KEY_FOR[code] || code,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(ev);
});
