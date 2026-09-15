(function () {
  const categorySelect = document.getElementById('category');
  const listEl = document.getElementById('list');
  const statusEl = document.getElementById('status');
  const toggleAllBtn = document.getElementById('toggleAll');

  let data = { categories: [] };
  let allRevealed = false;

  function setStatus(msg) {
    statusEl.textContent = msg || '';
  }

  function renderCategory(index) {
    const cat = data.categories[index];
    listEl.innerHTML = '';
    if (!cat || !cat.questions.length) {
      setStatus('لا توجد أسئلة في هذه الفئة.');
      return;
    }
    setStatus(`عدد الأسئلة: ${cat.questions.length}`);

    cat.questions.forEach((item, i) => {
      const card = document.createElement('article');
      card.className = 'q-card';

      const head = document.createElement('div');
      head.className = 'q-head';

      const num = document.createElement('span');
      num.className = 'q-num';
      num.textContent = String(i + 1);

      const qText = document.createElement('p');
      qText.className = 'q-text';
      qText.textContent = item.q;

      head.appendChild(qText);
      head.appendChild(num);

      const answer = document.createElement('div');
      answer.className = 'a-text';
      answer.textContent = 'الإجابة: ' + item.a;
      answer.hidden = !allRevealed;

      const btn = document.createElement('button');
      btn.className = 'reveal';
      btn.type = 'button';
      btn.textContent = allRevealed ? 'إخفاء الإجابة' : 'عرض الإجابة';
      btn.addEventListener('click', () => {
        answer.hidden = !answer.hidden;
        btn.textContent = answer.hidden ? 'عرض الإجابة' : 'إخفاء الإجابة';
      });

      card.appendChild(head);
      card.appendChild(btn);
      card.appendChild(answer);
      listEl.appendChild(card);
    });
  }

  function fillCategories() {
    categorySelect.innerHTML = '';
    data.categories.forEach((cat, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = cat.name;
      categorySelect.appendChild(opt);
    });
  }

  categorySelect.addEventListener('change', (e) => {
    renderCategory(parseInt(e.target.value, 10));
  });

  toggleAllBtn.addEventListener('click', () => {
    allRevealed = !allRevealed;
    toggleAllBtn.textContent = allRevealed
      ? 'إخفاء كل الإجابات'
      : 'إظهار كل الإجابات';
    renderCategory(parseInt(categorySelect.value, 10));
  });

  setStatus('جاري تحميل الأسئلة...');

  fetch('/api/questions')
    .then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then((json) => {
      data = json;
      if (!data.categories || !data.categories.length) {
        setStatus('لا توجد فئات.');
        return;
      }
      fillCategories();
      renderCategory(0);
    })
    .catch(() => {
      setStatus('تعذر تحميل الأسئلة. حاول تحديث الصفحة.');
    });
})();
