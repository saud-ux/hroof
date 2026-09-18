/* جوال اللاعب: لا تكبير بالقرص ولا بالضغط مرتين.
   سفاري في الآيفون يتجاهل user-scalable=no في الـ viewport، فنمنع الإيماءات
   نفسها هنا، و touch-action: manipulation في CSS يلغي تكبير الضغطتين. */
(() => {
  const stop = (e) => e.preventDefault();
  // قرص بإصبعين (سفاري)
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener('gestureend', stop, { passive: false });
  // قرص بإصبعين (كروم وأندرويد)
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  // ضغطتان سريعتان في مكان فارغ: لا تكبير. الأزرار والحقول تبقى كما هي.
  let last = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - last < 350 && !e.target.closest('input, textarea, select, button, a, label')) e.preventDefault();
    last = now;
  }, { passive: false });
})();
