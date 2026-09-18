/* الوضع الداكن بزر، لا بإعداد الجهاز.
   يُحمَّل في <head> قبل الأنماط حتى لا تومض الصفحة بالفاتح قبل الداكن.
   كل زر عليه data-theme-toggle يبدّل الوضع، والاختيار يُحفظ في هذا الجهاز. */
(() => {
  const KEY = 'zir-theme';
  const root = document.documentElement;
  const read = () => { try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch (_) { return 'light'; } };

  function apply(theme) {
    root.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && !meta.dataset.fixed) meta.content = theme === 'dark' ? '#17150f' : '#fffaf0';
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      const dark = theme === 'dark';
      btn.setAttribute('aria-pressed', String(dark));
      btn.setAttribute('aria-label', dark ? 'الوضع الفاتح' : 'الوضع الداكن');
      btn.title = btn.getAttribute('aria-label');
      if (window.ZIcon) btn.innerHTML = ZIcon.icon(dark ? 'sun' : 'moon');
    });
  }

  apply(read());

  function bind() {
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      btn.addEventListener('click', () => {
        const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(KEY, next); } catch (_) { /* ignore */ }
        apply(next);
      });
    });
    apply(root.dataset.theme);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
