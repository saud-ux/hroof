// Question browser ------------------------------------------------------------
// Both host screens share it: pick a letter, read every question filed under it
// together with its answer, then ask the one you want. The old random pick is
// still there as a shortcut, but nothing is drawn blind any more.
//
// The bank is too big to ship whole (a letter like ا holds hundreds per
// difficulty), so the list arrives a page at a time over the socket.
(() => {
  const PAGE = 24;

  function createQuestionBrowser(opts) {
    const {
      root,
      socket,
      requestEvent,          // client -> server: ask for a page
      pageEvent,             // server -> client: here is a page
      difficulties,
      onAsk,                 // (question) => void
      counts = () => ({}),   // { difficulty: remaining } for the tab badges
      canAsk = () => true,
      blockedTitle = '',
      formatNumber = (n) => String(n),
      pageSize = PAGE,
    } = opts;

    const st = {
      letter: '',
      difficulty: difficulties[0],
      items: [],
      total: 0,
      // The first page is requested by the screen once the socket is registered
      // as a host, so the list starts out waiting rather than looking empty.
      loading: true,
    };

    // ---- Shell ----
    root.classList.add('qbrowse');
    root.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'qbrowse-head';
    const title = document.createElement('p');
    title.className = 'card-label qbrowse-title';
    const tabs = document.createElement('div');
    tabs.className = 'qbrowse-tabs';
    head.append(title, tabs);

    const list = document.createElement('ul');
    list.className = 'qbrowse-list';

    const foot = document.createElement('div');
    foot.className = 'qbrowse-foot';
    const moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'btn btn-ghost btn-small qbrowse-more';
    moreBtn.textContent = 'عرض المزيد';
    const status = document.createElement('span');
    status.className = 'qbrowse-status muted';
    foot.append(moreBtn, status);

    root.append(head, list, foot);

    const tabButtons = difficulties.map(d => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'qbrowse-tab';
      btn.dataset.diff = d;
      const label = document.createElement('span');
      label.textContent = d;
      const badge = document.createElement('span');
      badge.className = 'qbrowse-tab-count';
      btn.append(label, badge);
      tabs.appendChild(btn);
      return { d, btn, badge };
    });

    // ---- Rendering ----
    function renderHead() {
      title.textContent = st.letter
        ? `أسئلة حرف ${st.letter} — اقرأها ثم اختر`
        : 'كل الأسئلة — اقرأها ثم اختر';
      const remaining = counts() || {};
      tabButtons.forEach(({ d, btn, badge }) => {
        btn.classList.toggle('active', d === st.difficulty);
        const left = remaining[d];
        badge.textContent = left == null ? '' : `(${formatNumber(left)})`;
      });
    }

    function renderItem(q) {
      const li = document.createElement('li');
      li.className = 'qbrowse-item';
      li.dataset.id = q.id;

      const body = document.createElement('div');
      body.className = 'qbrowse-body';

      const text = document.createElement('p');
      text.className = 'qbrowse-q';
      text.textContent = q.text;

      const answer = document.createElement('p');
      answer.className = 'qbrowse-a';
      answer.append(document.createTextNode('الإجابة: '));
      const strong = document.createElement('b');
      strong.textContent = q.answer || '—';
      answer.appendChild(strong);

      body.append(text, answer);

      const tagBits = [q.category, q.hint].filter(Boolean);
      if (tagBits.length) {
        const tags = document.createElement('p');
        tags.className = 'qbrowse-tags muted';
        tags.textContent = tagBits.join(' · ');
        body.appendChild(tags);
      }

      const ask = document.createElement('button');
      ask.type = 'button';
      ask.className = 'btn btn-primary btn-small qbrowse-ask';
      ask.textContent = 'اسأل هذا';
      ask.disabled = !canAsk();
      if (ask.disabled && blockedTitle) ask.title = blockedTitle;
      ask.addEventListener('click', () => {
        if (ask.disabled) return;
        onAsk(q);
      });

      li.append(body, ask);
      return li;
    }

    function renderList() {
      list.innerHTML = '';
      if (st.loading && !st.items.length) {
        const li = document.createElement('li');
        li.className = 'qbrowse-empty muted';
        li.textContent = 'جارٍ التحميل…';
        list.appendChild(li);
      } else if (!st.items.length) {
        const li = document.createElement('li');
        li.className = 'qbrowse-empty muted';
        li.textContent = st.letter
          ? `لا توجد أسئلة ${st.difficulty} تبدأ إجابتها بحرف ${st.letter}`
          : `انتهت أسئلة الصعوبة ${st.difficulty}`;
        list.appendChild(li);
      } else {
        for (const q of st.items) list.appendChild(renderItem(q));
      }

      moreBtn.hidden = st.items.length >= st.total;
      moreBtn.disabled = st.loading;
      status.textContent = st.total
        ? `${formatNumber(st.items.length)} من ${formatNumber(st.total)}`
        : '';
    }

    function render() { renderHead(); renderList(); }

    // ---- Paging ----
    function request(offset) {
      st.loading = true;
      renderList();
      socket.emit(requestEvent, {
        difficulty: st.difficulty,
        letter: st.letter || undefined,
        offset,
        limit: pageSize,
      });
    }

    function reload() {
      st.items = [];
      st.total = 0;
      request(0);
    }

    socket.on(pageEvent, (payload) => {
      if (!payload) return;
      // A page for a letter or difficulty the host has already moved past.
      if ((payload.letter || '') !== st.letter) return;
      if (payload.difficulty !== st.difficulty) return;

      st.loading = false;
      st.total = payload.total || 0;
      const items = Array.isArray(payload.items) ? payload.items : [];
      if (!payload.offset) st.items = items;
      else if (payload.offset === st.items.length) st.items = st.items.concat(items);
      else return render(); // out-of-order page: keep what we have
      render();
    });

    moreBtn.addEventListener('click', () => {
      if (st.loading || st.items.length >= st.total) return;
      request(st.items.length);
    });

    tabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.qbrowse-tab');
      if (!btn) return;
      if (btn.dataset.diff === st.difficulty) return;
      st.difficulty = btn.dataset.diff;
      renderHead();
      reload();
    });

    render();

    return {
      // The letter strip drives this; a change reloads the list.
      setLetter(letter) {
        const next = letter || '';
        if (next === st.letter) return;
        st.letter = next;
        renderHead();
        reload();
      },
      // Remaining counts changed (a question was used, the session was reset).
      // Takes the letter too, so a screen that just reset its own selection
      // doesn't reload the list twice.
      refresh(letter) {
        if (letter !== undefined) st.letter = letter || '';
        renderHead();
        reload();
      },
      // Re-run the ask-button gate without touching the list.
      refreshGate() { renderList(); },
      difficulty() { return st.difficulty; },
      start() { reload(); },
    };
  }

  window.createQuestionBrowser = createQuestionBrowser;
})();
