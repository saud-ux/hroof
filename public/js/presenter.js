(() => {
  const socket = io();
  socket.on('connect', () => socket.emit('presenter:register'));

  // Header
  const headerTeams = document.getElementById('header-teams');
  const endMatchBtn = document.getElementById('end-match-btn');
  const settingsBtn = document.getElementById('settings-btn');

  // Views
  const matchView = document.getElementById('match-view');
  const pickerView = document.getElementById('picker-view');
  const questionView = document.getElementById('question-view');

  // Match picker
  const rosterGrid = document.getElementById('roster-grid');
  const startMatchBtn = document.getElementById('start-match-btn');
  const clearPicksBtn = document.getElementById('clear-picks-btn');
  const qrImg = document.getElementById('qr');
  const lanUrlEl = document.getElementById('lan-url');

  // Difficulty picker
  const pickerHint = document.getElementById('picker-hint');
  const diffButtons = Array.from(document.querySelectorAll('.diff-btn'));
  const letterStrip = document.getElementById('letter-strip');
  const countEls = {
    'سهل':   document.getElementById('count-easy'),
    'متوسط': document.getElementById('count-medium'),
    'صعب':   document.getElementById('count-hard'),
  };

  // Question view
  const qCategory = document.getElementById('q-category');
  const qDifficulty = document.getElementById('q-difficulty');
  const qText = document.getElementById('q-text');
  const qOptions = document.getElementById('q-options');
  const qRiddle = document.getElementById('q-riddle');
  const riddleAnswer = document.getElementById('riddle-answer');
  const riddleAccepted = document.getElementById('riddle-accepted');
  const timerEl = document.getElementById('timer');
  const answerOptions = document.getElementById('answer-options');
  const nextBtn = document.getElementById('next-btn');

  const flash = document.getElementById('flash');
  const root = document.body;
  const toast = document.getElementById('toast');
  const timerSound = document.getElementById('timer-sound');

  // Settings modal
  const settingsModal = document.getElementById('settings-modal');
  const resetBtn = document.getElementById('reset-btn');
  const closeSettings = document.getElementById('close-settings');

  const st = {
    roster: [],           // [{id,name,color,connected}]
    match: null,          // {teamA, teamB} or null
    status: 'setup',
    hasQuestion: false,
    picked: [],           // team ids selected for the next match (max 2)
    poolCounts: null,
    letters: [],
    letterCounts: null,
    letter: '',        // '' = any letter
    audioUnlocked: false,
  };

  // ---- LAN URL / QR ----
  fetch('/lan-ip').then(r => r.json()).then(({ ip, port }) => {
    lanUrlEl.textContent = `http://${ip}:${port}/team`;
    qrImg.src = `/qr?t=${Date.now()}`;
  }).catch(() => {});

  // ---- Audio unlock ----
  function unlockAudio() {
    if (st.audioUnlocked) return;
    st.audioUnlocked = true;
    try {
      timerSound.volume = 0;
      const p = timerSound.play();
      if (p && typeof p.then === 'function') {
        p.then(() => { timerSound.pause(); timerSound.currentTime = 0; timerSound.volume = 1; }).catch(() => {});
      }
    } catch (_) { /* ignore */ }
  }
  document.addEventListener('click', unlockAudio, { once: false });

  function playBeepFallback() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.55);
      osc.onended = () => ctx.close();
    } catch (_) { /* ignore */ }
  }
  function playTimerEnd() {
    try {
      timerSound.currentTime = 0;
      const p = timerSound.play();
      if (p && typeof p.then === 'function') p.catch(() => playBeepFallback());
    } catch (_) { playBeepFallback(); }
  }

  // ---- Utility rendering ----
  function fmtTime(sec) {
    const s = Math.max(0, sec | 0);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }
  function showToast(msg, ms = 4000) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, ms);
  }

  function renderHeader() {
    if (!st.match) {
      headerTeams.innerHTML = '<span class="muted">لا توجد مباراة نشطة</span>';
      endMatchBtn.hidden = true;
      return;
    }
    const { teamA, teamB } = st.match;
    headerTeams.innerHTML = `
      <span class="match-team" style="color:${teamA.color}">
        <span class="dot" style="background:${teamA.connected ? teamA.color : 'transparent'}; box-shadow:0 0 0 1px ${teamA.color}"></span>
        ${teamA.name}
      </span>
      <span class="vs">×</span>
      <span class="match-team" style="color:${teamB.color}">
        <span class="dot" style="background:${teamB.connected ? teamB.color : 'transparent'}; box-shadow:0 0 0 1px ${teamB.color}"></span>
        ${teamB.name}
      </span>
    `;
    endMatchBtn.hidden = st.hasQuestion; // hide end-match while a question is live
  }

  function renderRosterGrid() {
    rosterGrid.innerHTML = '';
    if (!st.roster.length) {
      rosterGrid.innerHTML = '<p class="muted center">لا يوجد فرق مسجلة. ارجع إلى صفحة الإعداد.</p>';
      return;
    }
    st.roster.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'roster-card';
      btn.dataset.team = String(t.id);
      const picked = st.picked.includes(t.id);
      const order = picked ? (st.picked.indexOf(t.id) + 1) : null;
      btn.style.borderColor = t.color;
      if (picked) btn.classList.add('picked');
      btn.innerHTML = `
        <span class="roster-name">${t.name}</span>
        <span class="roster-meta">
          <span class="dot" style="background:${t.connected ? t.color : 'transparent'}; box-shadow:0 0 0 1px ${t.color}"></span>
          <span>${t.connected ? 'متصل' : 'غير متصل'}</span>
        </span>
        ${picked ? `<span class="pick-badge" style="background:${t.color}">${order === 1 ? 'أ' : 'ب'}</span>` : ''}
      `;
      btn.addEventListener('click', () => togglePick(t.id));
      rosterGrid.appendChild(btn);
    });
    startMatchBtn.disabled = st.picked.length !== 2;
  }

  function togglePick(teamId) {
    const idx = st.picked.indexOf(teamId);
    if (idx >= 0) st.picked.splice(idx, 1);
    else if (st.picked.length < 2) st.picked.push(teamId);
    renderRosterGrid();
  }

  function updateDiffButtons() {
    const bothConnected = !!st.match
      && st.match.teamA.connected
      && st.match.teamB.connected;
    const enable = bothConnected && !st.hasQuestion && st.status === 'waiting';
    diffButtons.forEach(btn => {
      btn.disabled = !enable;
      btn.title = bothConnected ? '' : 'بانتظار انضمام الفريقين للمباراة';
    });
    pickerHint.hidden = bothConnected;
  }

  function remainingFor(difficulty) {
    // With a letter selected the pool is the letter's bucket, not the whole level.
    if (st.letter && st.letterCounts && st.letterCounts[difficulty]) {
      return st.letterCounts[difficulty][st.letter] ?? 0;
    }
    return (st.poolCounts && st.poolCounts[difficulty]) ?? 0;
  }

  function applyPools(counts) {
    if (counts) st.poolCounts = counts;
    for (const k of Object.keys(countEls)) {
      const el = countEls[k];
      if (el) el.textContent = `${remainingFor(k)} متبقٍ`;
    }
  }

  function renderLetters() {
    if (!letterStrip || !st.letters.length) return;
    letterStrip.innerHTML = '';

    const anyBtn = document.createElement('button');
    anyBtn.className = 'letter-btn' + (st.letter === '' ? ' active' : '');
    anyBtn.dataset.letter = '';
    anyBtn.textContent = 'أي حرف';
    letterStrip.appendChild(anyBtn);

    st.letters.forEach(letter => {
      const total = ['سهل', 'متوسط', 'صعب']
        .reduce((sum, d) => sum + ((st.letterCounts && st.letterCounts[d] && st.letterCounts[d][letter]) || 0), 0);
      const btn = document.createElement('button');
      btn.className = 'letter-btn' + (st.letter === letter ? ' active' : '');
      btn.dataset.letter = letter;
      btn.textContent = letter;
      btn.disabled = total === 0;
      btn.title = total ? `${total} سؤال متبقٍ` : 'لا توجد أسئلة بهذا الحرف';
      letterStrip.appendChild(btn);
    });
  }

  function applyLetters(payload) {
    if (!payload) return;
    if (Array.isArray(payload.letters)) st.letters = payload.letters;
    if (payload.letterCounts) st.letterCounts = payload.letterCounts;
    // A letter that just ran dry falls back to "any letter".
    if (st.letter && !remainingForAnyDifficulty(st.letter)) st.letter = '';
    renderLetters();
    applyPools(null);
  }

  function remainingForAnyDifficulty(letter) {
    if (!st.letterCounts) return true;
    return ['سهل', 'متوسط', 'صعب'].some(d => (st.letterCounts[d] || {})[letter] > 0);
  }

  function renderQuestion(q) {
    qCategory.textContent = q.category || '—';
    qDifficulty.textContent = q.difficulty || '—';
    qText.textContent = q.text;
    if (Array.isArray(q.options) && q.options.length > 0) {
      qRiddle.hidden = true;
      qOptions.hidden = false;
      qOptions.innerHTML = '';
      q.options.forEach((opt, i) => {
        const div = document.createElement('div');
        div.className = 'opt' + (i === q.correct ? ' correct' : '');
        div.textContent = opt;
        qOptions.appendChild(div);
      });
    } else {
      qOptions.hidden = true;
      qRiddle.hidden = false;
      riddleAnswer.textContent = q.answer || '';
      const accepted = Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [q.answer].filter(Boolean);
      riddleAccepted.textContent = accepted.length ? `إجابات مقبولة: ${accepted.join('، ')}` : '';
    }
  }

  function showView(name) {
    matchView.hidden    = name !== 'match';
    pickerView.hidden   = name !== 'picker';
    questionView.hidden = name !== 'question';
  }

  function showMatchPicker() {
    st.hasQuestion = false;
    st.picked = [];
    hideTimer();
    answerOptions.innerHTML = '';
    root.classList.remove('buzzed');
    root.style.setProperty('--border-flash', 'transparent');
    renderRosterGrid();
    showView('match');
  }

  function showPicker() {
    st.hasQuestion = false;
    hideTimer();
    answerOptions.innerHTML = '';
    root.classList.remove('buzzed');
    root.style.setProperty('--border-flash', 'transparent');
    updateDiffButtons();
    showView('picker');
  }

  function showQuestion() {
    st.hasQuestion = true;
    updateDiffButtons();
    showView('question');
  }

  function flashBuzz(color) {
    flash.style.background = color;
    flash.hidden = false;
    flash.style.animation = 'none';
    void flash.offsetWidth;
    flash.style.animation = '';
    setTimeout(() => { flash.hidden = true; }, 320);
    root.style.setProperty('--border-flash', color);
    root.classList.add('buzzed');
  }

  function setTimerDisplay(seconds, ended = false) {
    timerEl.hidden = false;
    timerEl.textContent = fmtTime(seconds);
    timerEl.classList.toggle('ended', ended);
  }
  function hideTimer() { timerEl.hidden = true; timerEl.classList.remove('ended'); }

  function renderAnswerOptions(options) {
    answerOptions.innerHTML = '';
    if (!options || !options.length) return;
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-phase2';
      btn.textContent = `بدء وقت ${opt.teamName}`;
      btn.style.background = opt.color;
      btn.addEventListener('click', () => {
        socket.emit('presenter:startAnswerTimer', { teamId: opt.teamId });
      });
      answerOptions.appendChild(btn);
    });
  }

  // ---- Button wiring ----
  diffButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      unlockAudio();
      socket.emit('presenter:pickDifficulty', {
        difficulty: btn.dataset.diff,
        letter: st.letter || undefined,
      });
    });
  });

  if (letterStrip) {
    letterStrip.addEventListener('click', (e) => {
      const btn = e.target.closest('.letter-btn');
      if (!btn || btn.disabled) return;
      st.letter = btn.dataset.letter || '';
      renderLetters();
      applyPools(null);
    });
  }

  nextBtn.addEventListener('click', () => socket.emit('presenter:nextQuestion', {}));

  startMatchBtn.addEventListener('click', () => {
    if (st.picked.length !== 2) return;
    unlockAudio();
    socket.emit('presenter:startMatch', { teamAId: st.picked[0], teamBId: st.picked[1] });
  });
  clearPicksBtn.addEventListener('click', () => { st.picked = []; renderRosterGrid(); });
  endMatchBtn.addEventListener('click', () => socket.emit('presenter:endMatch'));

  settingsBtn.addEventListener('click', () => { settingsModal.hidden = false; });
  closeSettings.addEventListener('click', () => { settingsModal.hidden = true; });
  settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) settingsModal.hidden = true; });
  resetBtn.addEventListener('click', () => {
    const ok = window.confirm('هل تريد بدء جلسة جديدة؟ سيتم مسح كل الفرق والأسئلة المستخدمة.');
    if (!ok) return;
    socket.emit('presenter:resetSession', {});
    window.location.href = '/host';
  });

  // ---- Route by server status ----
  function routeView() {
    if (!st.roster.length) {
      // No teams set up — send to host page
      window.location.href = '/host';
      return;
    }
    if (!st.match) { showMatchPicker(); return; }
    if (st.hasQuestion || st.status === 'questionActive' || st.status === 'answering1' || st.status === 'answering2' || st.status === 'timeout1' || st.status === 'timeout2') {
      showQuestion();
      return;
    }
    showPicker();
  }

  // ---- Socket events ----
  socket.on('teams:update', ({ roster, match }) => {
    st.roster = Array.isArray(roster) ? roster : [];
    st.match = match || null;
    renderHeader();
    if (matchView.hidden === false) renderRosterGrid();
    updateDiffButtons();
  });

  socket.on('state:sync', (snap) => {
    if (!snap) return;
    st.roster = snap.roster || [];
    st.match = snap.match || null;
    st.status = snap.status;
    applyPools(snap.poolCounts);
    applyLetters({ letters: snap.letters, letterCounts: snap.letterCounts });
    renderHeader();
    if (snap.currentQuestion) {
      renderQuestion(snap.currentQuestion);
      showQuestion();
      if (snap.buzzWinnerInfo) {
        root.style.setProperty('--border-flash', snap.buzzWinnerInfo.color);
        root.classList.add('buzzed');
      }
      if (snap.status === 'answering1' || snap.status === 'answering2') {
        setTimerDisplay(snap.timerRemaining, false);
      } else if (['timeout1', 'timeout2'].includes(snap.status)) {
        setTimerDisplay(0, true);
        renderAnswerOptions(snap.answerOptions || []);
      } else {
        hideTimer();
      }
    } else {
      routeView();
    }
  });

  socket.on('state:lite', (snap) => {
    st.status = snap.status;
    // Don't yank the view mid-round; just refresh gates.
    updateDiffButtons();
    renderHeader();
  });

  socket.on('match:started', ({ match }) => {
    st.match = match;
    st.status = 'waiting';
    st.hasQuestion = false;
    renderHeader();
    showPicker();
    updateDiffButtons();
  });

  socket.on('match:ended', () => {
    st.match = null;
    st.status = 'noMatch';
    st.hasQuestion = false;
    renderHeader();
    showMatchPicker();
  });

  socket.on('question:showPresenter', (q) => {
    renderQuestion(q);
    showQuestion();
    hideTimer();
    answerOptions.innerHTML = '';
    root.classList.remove('buzzed');
    root.style.setProperty('--border-flash', 'transparent');
  });

  socket.on('buzz:winner', ({ color }) => flashBuzz(color));

  socket.on('timer:tick', ({ remaining }) => setTimerDisplay(remaining, false));

  socket.on('timer:end', () => {
    setTimerDisplay(0, true);
    playTimerEnd();
  });

  socket.on('answer:available', ({ options }) => {
    renderAnswerOptions(options || []);
  });

  socket.on('question:cleared', () => {
    // Return to picker (still in the match)
    showPicker();
    fetch('/config').then(() => {}); // no-op; pool counts stay from state:sync
    updateDiffButtons();
  });

  socket.on('session:reset', () => { window.location.href = '/host'; });

  socket.on('letters:update', (payload) => applyLetters(payload));

  socket.on('pool:empty', ({ difficulty, letter }) => {
    showToast(letter
      ? `لا توجد أسئلة ${difficulty} تبدأ إجابتها بحرف ${letter}. جرّب حرفًا أو صعوبة أخرى.`
      : `انتهت أسئلة الصعوبة ${difficulty}. اضغط 'جلسة جديدة' لإعادة التعيين.`);
  });
})();
