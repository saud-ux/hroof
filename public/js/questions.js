(() => {
  const $ = (id) => document.getElementById(id);
  const listEl = $('qb-list');
  const emptyEl = $('qb-empty');
  const statsEl = $('qb-stats');
  const searchEl = $('qb-search');
  const diffEl = $('qb-difficulty');
  const catEl = $('qb-category');
  const revealEl = $('qb-reveal');

  const DIFF_CLASS = { 'سهل': 'easy', 'متوسط': 'medium', 'صعب': 'hard' };
  const PAGE_SIZE = 200;
  let ALL = [];
  let LAST_FILTERED = [];
  let visibleCount = PAGE_SIZE;

  const escapeHTML = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  function correctIndex(q) {
    if (typeof q.correct === 'number') return q.correct;
    if (Array.isArray(q.options) && q.answer != null) {
      const i = q.options.indexOf(q.answer);
      return i >= 0 ? i : -1;
    }
    return -1;
  }

  function render(items) {
    listEl.innerHTML = '';
    emptyEl.hidden = items.length > 0;
    const revealAll = revealEl.checked;
    const slice = items.slice(0, visibleCount);
    const frag = document.createDocumentFragment();
    for (const q of slice) {
      const ci = correctIndex(q);
      const diffCls = DIFF_CLASS[q.difficulty] || '';
      const optsHTML = Array.isArray(q.options)
        ? `<ul class="qb-options">${q.options.map((opt, i) => `
            <li class="${revealAll && i === ci ? 'correct' : ''}">
              ${escapeHTML(opt)}${revealAll && i === ci ? '<span class="qb-mark">✓</span>' : ''}
            </li>`).join('')}</ul>`
        : '';
      const hintHTML = q.hint ? `<div class="qb-hint">تلميح: ${escapeHTML(q.hint)}</div>` : '';
      const ansHTML = revealAll && q.answer != null
        ? `<div class="qb-answer">الإجابة: <b>${escapeHTML(q.answer)}</b></div>`
        : `<details><summary><span class="qb-toggle"></span></summary>
             <div class="qb-answer">الإجابة: <b>${escapeHTML(q.answer ?? (Array.isArray(q.options) && ci >= 0 ? q.options[ci] : '—'))}</b></div>
           </details>`;

      const card = document.createElement('article');
      card.className = 'qb-card';
      card.innerHTML = `
        <div class="qb-card__top">
          <span class="qb-badge ${diffCls}">${escapeHTML(q.difficulty || '—')}</span>
          ${q.category ? `<span class="qb-badge">${escapeHTML(q.category)}</span>` : ''}
          <span class="qb-id">${escapeHTML(q.id || '')}</span>
        </div>
        <div class="qb-text">${escapeHTML(q.text || '')}</div>
        ${hintHTML}
        ${optsHTML}
        ${ansHTML}
      `;
      frag.appendChild(card);
    }
    listEl.appendChild(frag);
    if (items.length > slice.length) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'btn btn-ghost';
      more.style.margin = '0.5rem auto';
      more.style.display = 'block';
      more.textContent = `عرض المزيد (${items.length - slice.length} متبقّي)`;
      more.addEventListener('click', () => {
        visibleCount += PAGE_SIZE;
        render(LAST_FILTERED);
      });
      listEl.appendChild(more);
    }
  }

  function applyFilters() {
    const q = searchEl.value.trim().toLowerCase();
    const diff = diffEl.value;
    const cat = catEl.value;
    const filtered = ALL.filter(item => {
      if (diff && item.difficulty !== diff) return false;
      if (cat && item.category !== cat) return false;
      if (!q) return true;
      const hay = [
        item.text, item.answer, item.category, item.hint, item.id,
        ...(Array.isArray(item.options) ? item.options : []),
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
    statsEl.textContent = `عرض ${filtered.length} من ${ALL.length} سؤال`;
    visibleCount = PAGE_SIZE;
    LAST_FILTERED = filtered;
    render(filtered);
  }

  function populateCategories() {
    const cats = Array.from(new Set(ALL.map(q => q.category).filter(Boolean))).sort();
    for (const c of cats) {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      catEl.appendChild(opt);
    }
  }

  async function load() {
    try {
      const res = await fetch('/api/questions', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      ALL = Array.isArray(data.questions) ? data.questions : [];
      populateCategories();
      const c = data.counts || {};
      statsEl.textContent = `المجموع: ${ALL.length}  •  سهل ${c['سهل'] || 0} / متوسط ${c['متوسط'] || 0} / صعب ${c['صعب'] || 0}`;
      LAST_FILTERED = ALL;
      render(ALL);
    } catch (err) {
      statsEl.textContent = 'تعذّر تحميل الأسئلة.';
      console.error(err);
    }
  }

  searchEl.addEventListener('input', applyFilters);
  diffEl.addEventListener('change', applyFilters);
  catEl.addEventListener('change', applyFilters);
  revealEl.addEventListener('change', applyFilters);

  load();
})();
