// يُحقن داخل صفحة التحكم فقط. صفحة التحكم لم تعد فيها اختصارات كيبورد مدمجة،
// فالإضافة تضغط الأزرار مباشرة عند وصول الأمر من الخدمة الخلفية.

// رمز المفتاح (يرسله background.js) → مُحدِّد الزر المقابل في الصفحة.
const SELECTOR_FOR = {
  Space: '#arm-btn',                     // فتح الزر (تجهيز)
  Escape: '#disarm-btn',                 // قفل (تصفير الجولة)
  KeyN: '#next-btn',                     // جولة جديدة
  KeyA: '#award-btn',                    // نقطة للفائز
  KeyH: '#toggle-answer',                // إظهار/إخفاء الإجابة
  Digit1: '#diff-row [data-diff="سهل"]',
  Digit2: '#diff-row [data-diff="متوسط"]',
  Digit3: '#diff-row [data-diff="صعب"]',
  Digit5: '.timer-btn[data-seconds="5"]',
  Digit0: '.timer-btn[data-seconds="10"]',
};

// نضغط الزر فقط إن كان ظاهرًا ومفعّلًا — نفس شرط الصفحة القديم.
function clickIfShown(selector) {
  const el = document.querySelector(selector);
  if (!el || el.hidden || el.disabled) return;
  el.click();
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'hroof-shortcut') return;
  const selector = SELECTOR_FOR[msg.code];
  if (selector) clickIfShown(selector);
});
