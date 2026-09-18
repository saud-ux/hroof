(() => {
  const socket = io('/solo');

  const roundLabel = document.getElementById('round-label');
  const shareLink = document.getElementById('share-link');
  const copyLink = document.getElementById('copy-link');
  const shareQr = document.getElementById('share-qr');
  const winnerBox = document.getElementById('winner-box');
  const stageCard = document.querySelector('.stage-card');
  const winnerName = document.getElementById('winner-name');
  const winnerMs = document.getElementById('winner-ms');
  const armBtn = document.getElementById('arm-btn');
  const nextBtn = document.getElementById('next-btn');
  const disarmBtn = document.getElementById('disarm-btn');
  const clearBtn = document.getElementById('clear-btn');
  const pressOrder = document.getElementById('press-order');
  const awardBtn = document.getElementById('award-btn');
  const scoreboard = document.getElementById('scoreboard');
  const scoreList = document.getElementById('score-list');
  const resetScoresBtn = document.getElementById('reset-scores');
  const timerButtons = Array.from(document.querySelectorAll('.timer-btn'));
  const stopTimerBtn = document.getElementById('stop-timer');
  const timerDisplay = document.getElementById('timer-display');
  const playersList = document.getElementById('players-list');
  const playersCount = document.getElementById('players-count');
  const playersPill = document.getElementById('players-pill');
  const playersEmpty = document.getElementById('players-empty');
  const qpick = document.getElementById('qpick');
  const letterStrip = document.getElementById('letter-strip');
  const diffRow = document.getElementById('diff-row');
  const questionBox = document.getElementById('question-box');
  const qCategory = document.getElementById('q-category');
  const qDifficulty = document.getElementById('q-difficulty');
  const qText = document.getElementById('q-text');
  const qAnswer = document.getElementById('q-answer');
  const qHint = document.getElementById('q-hint');
  const clearQBtn = document.getElementById('clear-q-btn');
  const awardLabel = document.getElementById('award-label');
  const statePill = document.getElementById('state-pill');
  const soundBtn = document.getElementById('sound-btn');
  const toggleAnswerBtn = document.getElementById('toggle-answer');
  const qrFold = document.getElementById('qr-fold');
  const toastEl = document.getElementById('host-toast');

  const voiceBtn = document.getElementById('voice-btn');
  const voiceStatus = document.getElementById('voice-status');
  const micMeter = document.getElementById('mic-meter');
  const micLevel = document.getElementById('mic-level');
  const voiceMode = document.getElementById('voice-mode');
  const voiceAllBtn = document.getElementById('voice-all-btn');

  const teamsEnabled = document.getElementById('teams-enabled');
  const teamsEditor = document.getElementById('teams-editor');
  const teamsRows = document.getElementById('teams-rows');
  const addTeamBtn = document.getElementById('add-team');
  const saveTeamsBtn = document.getElementById('save-teams');
  const teamsError = document.getElementById('teams-error');

  const browserRoot = document.getElementById('question-browser');

  // لعبة الخلية
  const modeRow = document.getElementById('mode-row');
  const cellPanel = document.getElementById('cell-panel');
  const cellMapEl = document.getElementById('cell-map');
  const cellTeamsEl = document.getElementById('cell-teams');
  const cellStatus = document.getElementById('cell-status');
  const cellWinBanner = document.getElementById('cell-win-banner');
  const cellMenu = document.getElementById('cell-menu');
  const cellMenuRow = document.getElementById('cell-menu-row');
  const cellMenuLetter = document.getElementById('cell-menu-letter');
  const cellMenuClose = document.getElementById('cell-menu-close');
  const cellResolve = document.getElementById('cell-resolve');
  const cellResolveLabel = document.getElementById('cell-resolve-label');
  const cellCorrectBtn = document.getElementById('cell-correct');
  const cellOtherBtn = document.getElementById('cell-other');
  const cellBurnBtn = document.getElementById('cell-burn');
  const cellKeepBtn = document.getElementById('cell-keep');
  const cellNewBtn = document.getElementById('cell-new');
  const cellUndoBtn = document.getElementById('cell-undo');

  const DIFFS = ['سهل', 'متوسط', 'صعب'];
  const st = { letter: '', letters: [], letterCounts: null, poolCounts: null };

  // Set once the question browser is built, below the functions that use it.
  let qbrowse = null;
  // The bank only changes when a question is taken; presses and joins also
  // redraw the desk, and the list must not reload under the host's finger.
  let lastPoolSig = '';

  const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const toArabic = (n) => String(n).replace(/\d/g, d => AR_DIGITS[Number(d)]);

  fetch('/links')
    .then(r => r.json())
    .then(({ buzz }) => { shareLink.textContent = buzz; })
    .catch(() => { shareLink.textContent = `${location.origin}/buzz`; });

  // ---- Small helpers ----
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* ignore */ } },
  };

  // A message in the page instead of alert(), which froze the keyboard flow.
  let toastTimer = null;
  function toast(text, kind = '') {
    toastEl.textContent = text;
    toastEl.dataset.kind = kind;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200);
  }

  // navigator.clipboard only exists on https/localhost; on a plain http LAN
  // link fall back to the old copy command so the button still works.
  copyLink.addEventListener('click', async () => {
    const text = shareLink.textContent;
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch (_) { /* fall through */ }
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      ta.remove();
    }
    copyLink.textContent = ok ? 'تم النسخ' : 'انسخ يدويًا';
    setTimeout(() => { copyLink.textContent = 'نسخ'; }, 1500);
  });

  // The QR is only needed while people join; remember when the host folds it.
  if (store.get('host-qr-open', '1') === '0') qrFold.open = false;
  qrFold.addEventListener('toggle', () => store.set('host-qr-open', qrFold.open ? '1' : '0'));

  // ---- Sound ----
  // One audio context, woken by the host's first click, so the cue can play
  // later when a press arrives (browsers block audio started without a tap).
  let audioCtx = null;
  let soundOn = store.get('host-sound', '1') === '1';
  function unlockAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (_) { /* ignore */ }
  }
  ['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, unlockAudio, { capture: true, passive: true }));

  function tone(freq, start, dur, peak = 0.25, type = 'sine') {
    const ctx = audioCtx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
    gain.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime + start);
    osc.stop(ctx.currentTime + start + dur + 0.05);
  }
  function playBuzz() {
    if (!soundOn) return;
    try { unlockAudio(); if (!audioCtx) return; tone(660, 0, 0.18, 0.28, 'triangle'); tone(990, 0.12, 0.35, 0.24, 'triangle'); } catch (_) { /* ignore */ }
  }

  function renderSoundBtn() {
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.textContent = soundOn ? '🔔 الصوت' : '🔕 صامت';
  }
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    store.set('host-sound', soundOn ? '1' : '0');
    renderSoundBtn();
  });
  renderSoundBtn();

  // ---- Answer privacy ----
  // When the host screen is on a projector, the answer can be blurred and
  // peeked at by holding the mouse over it.
  let answerHidden = store.get('host-answer-hidden', '0') === '1';
  function renderAnswerToggle() {
    questionBox.classList.toggle('answer-hidden', answerHidden);
    toggleAnswerBtn.setAttribute('aria-pressed', String(answerHidden));
    toggleAnswerBtn.firstChild.textContent = answerHidden ? 'إظهار الإجابة ' : 'إخفاء الإجابة ';
  }
  function toggleAnswer() {
    answerHidden = !answerHidden;
    store.set('host-answer-hidden', answerHidden ? '1' : '0');
    renderAnswerToggle();
  }
  toggleAnswerBtn.addEventListener('click', toggleAnswer);
  renderAnswerToggle();

  shareQr.addEventListener('error', () => { shareQr.hidden = true; });

  socket.on('connect', () => socket.emit('solo:hostRegister'));

  // ---- Teams ----
  let palette = [];
  let draftTeams = [];
  // While the host is typing we must not overwrite their rows; the rest of the
  // time the editor mirrors the server so a cleared room or a second tab never
  // leaves stale teams behind.
  let editingTeams = false;

  function renderTeamRows() {
    teamsRows.innerHTML = '';
    (draftTeams || []).forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'team-row';

      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'color-swatch';
      swatch.style.background = t.color;
      swatch.title = 'غيّر اللون';
      swatch.addEventListener('click', () => {
        const idx = palette.indexOf(t.color);
        t.color = palette[(idx + 1) % palette.length];
        editingTeams = true;
        renderTeamRows();
      });

      const input = document.createElement('input');
      input.className = 'solo-input team-name-input';
      input.type = 'text';
      input.maxLength = 24;
      input.value = t.name;
      input.placeholder = `الفريق ${i + 1}`;
      input.addEventListener('input', () => { t.name = input.value; editingTeams = true; });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'solo-kick';
      del.textContent = '×';
      del.title = 'حذف';
      del.addEventListener('click', () => {
        draftTeams.splice(i, 1);
        editingTeams = true;
        renderTeamRows();
      });

      row.append(swatch, input, del);
      teamsRows.appendChild(row);
    });
  }

  teamsEnabled.addEventListener('change', () => {
    if (teamsEnabled.checked) {
      editingTeams = true;
      teamsEditor.hidden = false;
      if (!draftTeams.length) {
        draftTeams = [
          { name: 'الفريق الأول', color: palette[0] || '#22c55e' },
          { name: 'الفريق الثاني', color: palette[1] || '#3b82f6' },
        ];
      }
      renderTeamRows();
    } else {
      editingTeams = false;
      teamsEditor.hidden = true;
      draftTeams = [];
      socket.emit('solo:setTeams', { teams: [] }); // back to free-for-all
    }
  });

  addTeamBtn.addEventListener('click', () => {
    if (draftTeams.length >= 8) return;
    editingTeams = true;
    draftTeams.push({
      name: `الفريق ${draftTeams.length + 1}`,
      color: palette[draftTeams.length % palette.length] || '#22c55e',
    });
    renderTeamRows();
  });

  saveTeamsBtn.addEventListener('click', () => {
    teamsError.hidden = true;
    socket.emit('solo:setTeams', { teams: draftTeams });
    editingTeams = false; // the next state is authoritative again
  });

  socket.on('solo:teamsRejected', ({ reason }) => {
    teamsError.textContent = reason || 'تعذّر حفظ الفرق';
    teamsError.hidden = false;
    editingTeams = true; // the rows were not accepted, so keep what the host typed
  });

  // ---- Voice ----
  let voiceRoom = { members: [], speakers: [], mode: 'winner' };
  let lastSnap = null;
  let lastWinnerKey = null;   // null until the first state, so a reload stays quiet
  const voice = window.createVoice({
    socket,
    isHost: true,
    onStatus: (text, state) => {
      voiceStatus.textContent = text;
      voiceStatus.dataset.state = state || '';
    },
    onRoom: (room) => {
      voiceRoom = room;
      voiceMode.value = room.mode;
      const open = room.mode === 'open';
      voiceAllBtn.classList.toggle('on', open);
      voiceAllBtn.textContent = open ? '🔇 أغلق مايك الجميع' : '🎙 افتح المايك للجميع';
      renderPlayers(); // mic buttons follow who may speak right now
    },
    onLevel: (v, open) => {
      micMeter.hidden = !voice.isJoined();
      micMeter.dataset.open = open ? '1' : '0';
      micLevel.style.width = `${Math.round(v * 100)}%`;
    },
  });

  voiceBtn.addEventListener('click', async () => {
    if (voice.isJoined()) {
      voice.leave();
      voiceBtn.textContent = '🎙 تشغيل الصوت';
      return;
    }
    voiceBtn.disabled = true;
    const ok = await voice.join(socket.id);
    voiceBtn.disabled = false;
    if (ok) voiceBtn.textContent = '🔇 إيقاف الصوت';
  });

  voiceMode.addEventListener('change', () => {
    socket.emit('voice:setMode', { mode: voiceMode.value });
  });

  // One tap to hand every phone an open mic, and another to take it back.
  voiceAllBtn.addEventListener('click', () => {
    const next = voiceRoom.mode === 'open' ? 'winner' : 'open';
    socket.emit('voice:setMode', { mode: next });
  });

  function remainingFor(difficulty) {
    if (st.letter && st.letterCounts && st.letterCounts[difficulty]) {
      return st.letterCounts[difficulty][st.letter] ?? 0;
    }
    return (st.poolCounts && st.poolCounts[difficulty]) ?? 0;
  }

  function renderPicker() {
    if (!letterStrip) return;
    letterStrip.innerHTML = '';

    const anyBtn = document.createElement('button');
    anyBtn.className = 'letter-btn' + (st.letter === '' ? ' active' : '');
    anyBtn.dataset.letter = '';
    anyBtn.textContent = 'أي حرف';
    letterStrip.appendChild(anyBtn);

    st.letters.forEach(letter => {
      const total = DIFFS.reduce(
        (sum, d) => sum + ((st.letterCounts && st.letterCounts[d] && st.letterCounts[d][letter]) || 0), 0);
      const btn = document.createElement('button');
      btn.className = 'letter-btn' + (st.letter === letter ? ' active' : '');
      btn.dataset.letter = letter;
      btn.textContent = letter;
      btn.disabled = total === 0;
      btn.title = total ? `${total} سؤال متبقٍ` : 'لا توجد أسئلة بهذا الحرف';
      letterStrip.appendChild(btn);
    });

    diffRow.querySelectorAll('.diff-pill').forEach(btn => {
      const left = remainingFor(btn.dataset.diff);
      const el = btn.querySelector('.diff-count');
      if (el) el.textContent = `(${toArabic(left)})`;
      btn.disabled = left === 0;
    });
  }

  letterStrip.addEventListener('click', (e) => {
    const btn = e.target.closest('.letter-btn');
    if (!btn || btn.disabled) return;
    st.letter = btn.dataset.letter || '';
    renderPicker();
    if (qbrowse) qbrowse.setLetter(st.letter);
  });

  diffRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.diff-pill');
    if (!btn || btn.disabled) return;
    socket.emit('solo:pickQuestion', { difficulty: btn.dataset.diff, letter: st.letter || undefined });
  });

  // ---- The letter's questions, answers shown, so nothing is asked blind ----
  qbrowse = (browserRoot && window.createQuestionBrowser)
    ? window.createQuestionBrowser({
      root: browserRoot,
      socket,
      requestEvent: 'solo:browseQuestions',
      pageEvent: 'solo:questionPage',
      difficulties: DIFFS,
      formatNumber: toArabic,
      counts: () => DIFFS.reduce((acc, d) => { acc[d] = remainingFor(d); return acc; }, {}),
      onAsk: (q) => {
        socket.emit('solo:pickQuestion', {
          difficulty: q.difficulty,
          letter: st.letter || undefined,
          questionId: q.id,
        });
      },
    })
    : null;

  socket.on('solo:questionUnavailable', () => {
    toast('هذا السؤال استُخدم بالفعل — اختر سؤالًا آخر.', 'warn');
    if (qbrowse) qbrowse.refresh();
  });

  // ---- لعبة الخلية ----
  // خريطة المقدم: ضغطة تفتح الخلية للجميع، وضغطة مطوّلة تفتح التلوين اليدوي.
  const TEAM_A = 1;
  const TEAM_B = 2;
  const CELL_DIRS = ['أعلى ↕ أسفل', 'يمين ↔ يسار'];
  let cellMenuIndex = null;
  let cellTeamsSig = '';

  const cellGrid = (cellMapEl && window.createCellGrid)
    ? window.createCellGrid({
      root: cellMapEl,
      interactive: true,
      onOpen: (index) => socket.emit('solo:cellOpen', { index }),
      onMenu: (index) => openCellMenu(index),
    })
    : null;

  function cellState() {
    return (lastSnap && lastSnap.cell) || null;
  }

  function teamById(id) {
    return ((lastSnap && lastSnap.teams) || []).find(t => t.id === id) || null;
  }

  function cellLetterAt(index) {
    const c = cellState();
    return (c && index != null && c.letters) ? (c.letters[index] || '') : '';
  }

  modeRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.mode-btn');
    if (!btn) return;
    socket.emit('solo:setMode', { mode: btn.dataset.mode });
  });

  // ---- التلوين اليدوي ----
  function openCellMenu(index) {
    cellMenuIndex = index;
    cellMenuLetter.textContent = cellLetterAt(index) || '—';
    cellMenuRow.innerHTML = '';

    const teams = (lastSnap && lastSnap.teams) || [];
    const owner = (cellState() && cellState().owners[index]) ?? null;
    const choices = [
      ...teams.slice(0, 2).map(t => ({ label: `لـ${t.name}`, owner: t.id, tint: t.color })),
      { label: 'احرقها', owner: 'burn' },
      { label: 'تفريغها', owner: null, ghost: true },
    ];

    choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-small' + (choice.ghost ? ' btn-ghost' : '');
      btn.textContent = choice.label;
      if (choice.tint) {
        btn.style.background = choice.tint;
        btn.style.borderColor = choice.tint;
        btn.style.color = '#07080a';
      } else if (choice.owner === 'burn') {
        btn.classList.add('cell-btn-burn');
      }
      btn.disabled = owner === choice.owner;
      btn.addEventListener('click', () => {
        socket.emit('solo:cellAssign', { index, owner: choice.owner });
        closeCellMenu();
      });
      cellMenuRow.appendChild(btn);
    });

    cellMenu.hidden = false;
  }

  function closeCellMenu() {
    cellMenuIndex = null;
    cellMenu.hidden = true;
  }

  cellMenuClose.addEventListener('click', closeCellMenu);

  // ---- أسماء الفريقين وألوانهما ----
  function saveCellTeams() {
    const rows = Array.from(cellTeamsEl.querySelectorAll('.cell-team'));
    const teams = rows.map((row, i) => ({
      name: row.querySelector('.cell-team-name').value.trim() || `الفريق ${i + 1}`,
      color: row.dataset.color,
    }));
    if (teams.length === 2) socket.emit('solo:setTeams', { teams });
  }

  function renderCellTeams(teams) {
    const sig = JSON.stringify(teams.map(t => [t.name, t.color]));
    const typing = cellTeamsEl.contains(document.activeElement);
    if (sig === cellTeamsSig || typing) return;
    cellTeamsSig = sig;

    cellTeamsEl.innerHTML = '';
    teams.slice(0, 2).forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'cell-team';
      row.style.setProperty('--tint', t.color);
      row.dataset.color = t.color;

      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'cell-swatch';
      swatch.style.background = t.color;
      swatch.title = 'غيّر اللون';
      swatch.addEventListener('click', () => {
        const pal = (lastSnap && lastSnap.palette) || [];
        const at = pal.indexOf(row.dataset.color);
        row.dataset.color = pal[(at + 1) % pal.length] || row.dataset.color;
        saveCellTeams();
      });

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'cell-team-name';
      input.maxLength = 24;
      input.value = t.name;
      input.addEventListener('change', saveCellTeams);
      input.addEventListener('blur', saveCellTeams);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });

      const dir = document.createElement('span');
      dir.className = 'cell-team-dir';
      dir.textContent = CELL_DIRS[i];

      row.append(swatch, input, dir);
      cellTeamsEl.appendChild(row);
    });
  }

  // ---- حكم المقدم على الخلية المفتوحة ----
  cellCorrectBtn.addEventListener('click', () => socket.emit('solo:cellResolve', { result: 'correct' }));
  cellOtherBtn.addEventListener('click', () => socket.emit('solo:cellResolve', { result: 'other' }));
  cellBurnBtn.addEventListener('click', () => socket.emit('solo:cellResolve', { result: 'burn' }));
  cellKeepBtn.addEventListener('click', () => socket.emit('solo:cellResolve', { result: 'keep' }));

  cellNewBtn.addEventListener('click', () => {
    if (!confirm('جولة جديدة: حروف جديدة وشبكة فارغة. متأكد؟')) return;
    closeCellMenu();
    socket.emit('solo:cellNewRound');
  });
  cellUndoBtn.addEventListener('click', () => {
    closeCellMenu();
    socket.emit('solo:cellUndo');
  });

  function renderCellPanel(snap) {
    const on = snap.mode === 'cell';
    modeRow.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === snap.mode);
    });
    cellPanel.hidden = !on;
    if (!on) { closeCellMenu(); return; }
    if (!cellGrid) return;

    const cell = snap.cell || {};
    const teams = snap.teams || [];
    cellGrid.render(cell, teams);
    renderCellTeams(teams);

    const winTeam = cell.win ? teamById(cell.win.team) : null;
    cellWinBanner.hidden = !cell.win;
    if (cell.win) {
      cellWinBanner.textContent = winTeam
        ? `🏆 ${winTeam.name} وصل الحافتين — انتهت اللعبة`
        : '🏆 اكتمل خط الفوز — انتهت اللعبة';
      cellWinBanner.style.setProperty('--tint', winTeam ? winTeam.color : '#22c55e');
    }

    const openLetter = cell.open != null ? cellLetterAt(cell.open) : '';
    const w = snap.winner;
    const showResolve = cell.open != null && !!w && !cell.win;
    cellResolve.hidden = !showResolve;
    if (showResolve) {
      const winnerTeam = w.teamId != null ? teamById(w.teamId) : null;
      const other = winnerTeam ? teams.find(t => t.id !== winnerTeam.id) : null;
      cellResolveLabel.textContent = winnerTeam
        ? `الحرف ${openLetter} — أول من ضغط: ${w.name} (${winnerTeam.name})`
        : `الحرف ${openLetter} — أول من ضغط: ${w.name}`;
      cellCorrectBtn.textContent = winnerTeam ? `✓ صحيحة — ${winnerTeam.name}` : '✓ إجابة صحيحة';
      cellCorrectBtn.disabled = !winnerTeam;
      cellOtherBtn.textContent = other ? `أعطها ${other.name}` : 'أعطها للفريق الآخر';
      cellOtherBtn.disabled = !other;
    }

    if (cell.win) {
      cellStatus.textContent = winTeam ? `فاز ${winTeam.name}` : 'انتهت اللعبة';
      cellStatus.dataset.tone = 'win';
    } else if (cell.open != null) {
      cellStatus.textContent = w
        ? `الحرف ${openLetter} — احكم على الإجابة`
        : `الحرف ${openLetter} مفتوح — افتح الزر`;
      cellStatus.dataset.tone = 'open';
    } else {
      cellStatus.textContent = 'اضغط خلية لفتحها';
      cellStatus.dataset.tone = '';
    }

    cellUndoBtn.disabled = !cell.canUndo;
    if (cellMenuIndex != null) cellMenuLetter.textContent = cellLetterAt(cellMenuIndex) || '—';
  }

  clearQBtn.addEventListener('click', () => socket.emit('solo:clearQuestion'));

  // One tap awards the round to whoever pressed first — the common case.
  awardBtn.addEventListener('click', () => {
    if (!lastSnap || !lastSnap.winnerScoreKey) return;
    socket.emit('solo:award', { key: lastSnap.winnerScoreKey, delta: 1 });
  });

  // ---- Countdown ----
  timerButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      socket.emit('solo:startTimer', { seconds: Number(btn.dataset.seconds) });
    });
  });
  stopTimerBtn.addEventListener('click', () => socket.emit('solo:stopTimer'));

  socket.on('solo:timer', ({ running, remaining }) => {
    timerDisplay.hidden = !running;
    stopTimerBtn.hidden = !running;
    if (running) {
      timerDisplay.textContent = toArabic(remaining);
      timerDisplay.classList.toggle('urgent', remaining <= 3);
    }
  });

  socket.on('solo:timerEnd', () => {
    timerDisplay.hidden = false;
    timerDisplay.textContent = 'انتهى';
    timerDisplay.classList.add('urgent');
    playBeep();
    setTimeout(() => { timerDisplay.hidden = true; timerDisplay.classList.remove('urgent'); }, 2500);
  });

  function playBeep() {
    try {
      unlockAudio();
      if (!audioCtx) return;
      const ctx = audioCtx;
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
    } catch (_) { /* a missing beep is not worth failing over */ }
  }

  resetScoresBtn.addEventListener('click', () => {
    if (confirm('تصفير كل النقاط؟')) socket.emit('solo:resetScores');
  });

  const prevPoints = new Map();
  function renderScores(snap) {
    const rows = Array.isArray(snap.scores) ? snap.scores : [];
    scoreboard.hidden = rows.length === 0;
    scoreList.innerHTML = '';
    const top = rows.reduce((m, r) => Math.max(m, r.points), 0);
    const leaders = rows.filter(r => r.points === top).length;
    rows.forEach(row => {
      const li = document.createElement('li');
      li.style.borderInlineStart = `4px solid ${row.color || 'transparent'}`;
      // A sole leader is marked; a tie is not a lead.
      if (top > 0 && leaders === 1 && row.points === top) li.classList.add('lead');
      const before = prevPoints.get(row.key);
      if (before !== undefined && before !== row.points) li.classList.add(row.points > before ? 'bump-up' : 'bump-down');
      prevPoints.set(row.key, row.points);

      const minus = document.createElement('button');
      minus.className = 'score-btn';
      minus.textContent = '−';
      minus.title = 'إنقاص نقطة';
      minus.addEventListener('click', () => socket.emit('solo:award', { key: row.key, delta: -1 }));

      const name = document.createElement('span');
      name.className = 'score-name';
      name.textContent = row.name;

      const pts = document.createElement('span');
      pts.className = 'score-points';
      pts.textContent = toArabic(row.points);

      const plus = document.createElement('button');
      plus.className = 'score-btn';
      plus.textContent = '+';
      plus.title = 'إضافة نقطة';
      plus.addEventListener('click', () => socket.emit('solo:award', { key: row.key, delta: 1 }));

      li.append(minus, name, pts, plus);
      scoreList.appendChild(li);
    });
  }

  socket.on('solo:poolEmpty', ({ difficulty, letter }) => {
    toast(letter
      ? `لا توجد أسئلة ${difficulty} تبدأ إجابتها بحرف ${letter}.`
      : `انتهت أسئلة الصعوبة ${difficulty}.`, 'warn');
  });

  // ---- Keyboard: run a round without the mouse ----
  // Physical key codes, so the shortcuts work with an Arabic layout too.
  const clickIfShown = (btn) => {
    if (!btn || btn.hidden || btn.disabled) return false;
    btn.click();
    return true;
  };
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const t = e.target;
    if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
    // Space/Enter on a focused button already click it; don't click twice.
    if ((e.code === 'Space' || e.code === 'Enter') && t.closest('button, summary')) return;

    let handled = false;
    switch (e.code) {
      case 'Space': handled = clickIfShown(armBtn); break;
      case 'Escape': handled = clickIfShown(disarmBtn); break;
      case 'KeyN': case 'Enter': handled = clickIfShown(nextBtn); break;
      case 'KeyA': handled = clickIfShown(awardBtn); break;
      case 'KeyH': if (!questionBox.hidden) { toggleAnswer(); handled = true; } break;
      case 'Digit1': case 'Numpad1': handled = clickIfShown(diffRow.querySelector('[data-diff="سهل"]')); break;
      case 'Digit2': case 'Numpad2': handled = clickIfShown(diffRow.querySelector('[data-diff="متوسط"]')); break;
      case 'Digit3': case 'Numpad3': handled = clickIfShown(diffRow.querySelector('[data-diff="صعب"]')); break;
      case 'Digit5': case 'Numpad5': handled = clickIfShown(timerButtons.find(b => b.dataset.seconds === '5')); break;
      case 'Digit0': case 'Numpad0': handled = clickIfShown(timerButtons.find(b => b.dataset.seconds === '10')); break;
      default: return;
    }
    // Space never scrolls the desk mid-round, even when there is nothing to open.
    if (handled || e.code === 'Space') e.preventDefault();
  });

  armBtn.addEventListener('click', () => socket.emit('solo:arm'));
  nextBtn.addEventListener('click', () => socket.emit('solo:nextRound'));
  disarmBtn.addEventListener('click', () => socket.emit('solo:disarm'));
  clearBtn.addEventListener('click', () => {
    if (confirm('تصفير الغرفة يطرد كل المشاركين. متأكد؟')) socket.emit('solo:clearAll');
  });

  socket.on('solo:state', (snap) => {
    roundLabel.textContent = `جولة ${toArabic(snap.round)}`;

    // The very first state arrives before hostRegister completes and carries no
    // bank, so only hide the picker once we know there is nothing to pick from.
    if (snap.hasBank) {
      if (Array.isArray(snap.letters)) st.letters = snap.letters;
      if (snap.letterCounts) st.letterCounts = snap.letterCounts;
      if (snap.poolCounts) st.poolCounts = snap.poolCounts;
      if (qpick) qpick.hidden = false;
      renderPicker();

      const sig = JSON.stringify([snap.poolCounts || null, snap.letterCounts || null]);
      if (sig !== lastPoolSig) {
        lastPoolSig = sig;
        if (qbrowse) qbrowse.refresh(st.letter);
      }
    } else if (qpick && snap.hasBank === false) {
      qpick.hidden = true;
    }

    const q = snap.question;
    questionBox.hidden = !q;
    clearQBtn.hidden = !q;
    if (q) {
      qCategory.textContent = q.category || '—';
      qDifficulty.textContent = q.difficulty || '—';
      qText.textContent = q.text;
      qAnswer.textContent = q.answer || '—';
      qHint.textContent = q.hint ? `تلميح: ${q.hint}` : '';
    }

    const winner = snap.winner;
    winnerBox.classList.toggle('idle', !winner);
    winnerBox.classList.toggle('hit', !!winner);
    const roomState = winner ? 'hit' : (snap.armed ? 'armed' : 'closed');
    if (stageCard) stageCard.dataset.state = roomState;
    statePill.dataset.state = roomState;
    statePill.textContent = winner
      ? `ضغط ${winner.teamName || winner.name}`
      : (snap.armed ? 'الزر مفتوح' : 'الزر مقفل');

    // A new first press gets a sound, so the host can look at the players.
    const winnerKey = winner ? `${snap.round}:${winner.id}` : null;
    if (winnerKey && lastWinnerKey !== null && winnerKey !== lastWinnerKey) playBuzz();
    lastWinnerKey = winnerKey || '';
    if (winner) {
      winnerName.textContent = winner.teamName ? `${winner.name} — ${winner.teamName}` : winner.name;
      winnerMs.textContent = `${toArabic(winner.ms)} مللي ثانية`;
      winnerBox.style.background = winner.color || '';
      winnerBox.style.borderColor = 'transparent';
    } else {
      winnerName.textContent = snap.armed ? 'الزر مفتوح — بانتظار أول ضغطة' : 'الزر مقفل';
      winnerMs.textContent = '';
      winnerBox.style.background = '';
      winnerBox.style.borderColor = '';
    }

    armBtn.hidden = !!winner || snap.armed;
    nextBtn.hidden = !winner;
    disarmBtn.hidden = !snap.armed || !!winner;

    pressOrder.innerHTML = '';
    snap.presses.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = i === 0 ? 'first' : '';
      const who = p.teamName ? `${p.name} <span class="press-team">${p.teamName}</span>` : p.name;
      li.innerHTML = `<span>${who}</span><span class="solo-ms">${toArabic(p.ms)} م.ث</span>`;
      if (p.color) li.style.borderInlineStart = `4px solid ${p.color}`;
      pressOrder.appendChild(li);
    });

    lastSnap = snap;
    renderScores(snap);
    const w = snap.winner;
    awardBtn.hidden = !w || !snap.winnerScoreKey;
    if (w) awardLabel.textContent = `✓ نقطة لـ ${w.teamName || w.name}`;
    if (Array.isArray(snap.palette) && snap.palette.length) palette = snap.palette;
    if (Array.isArray(snap.teams) && !editingTeams) {
      const on = snap.teams.length > 0;
      teamsEnabled.checked = on;
      teamsEditor.hidden = !on;
      draftTeams = snap.teams.map(t => ({ name: t.name, color: t.color }));
      renderTeamRows();
    }
    // طور الخلية يثبّت الغرفة على فريقين، فمحرر الفرق العام يُقفل حتى لا
    // يكسر القاعدة من الخلف.
    teamsEnabled.disabled = snap.mode === 'cell';
    teamsEnabled.title = snap.mode === 'cell' ? 'طور الخلية يحتاج فريقين بالضبط' : '';
    renderCellPanel(snap);
    renderPlayers();
  });

  function renderPlayers() {
    const snap = lastSnap;
    if (!snap) return;
    playersCount.textContent = toArabic(snap.players.length);
    if (playersPill) playersPill.textContent = `${toArabic(snap.players.length)} مشارك`;
    if (playersEmpty) playersEmpty.hidden = snap.players.length > 0;
    playersList.innerHTML = '';
    snap.players.forEach(p => {
      const li = document.createElement('li');
      const pressed = snap.presses.some(x => x.id === p.id);
      const label = p.teamName ? `${p.name} <span class="press-team">${p.teamName}</span>` : p.name;
      li.innerHTML = `<span class="player-dot" style="background:${p.color || 'transparent'}"></span><span>${label}</span>`;
      if (pressed) li.classList.add('pressed');
      const inVoice = voiceRoom.members.some(m => m.id === p.id);
      if (inVoice) {
        const speaking = voiceRoom.speakers.includes(p.id);
        const mic = document.createElement('button');
        mic.className = 'solo-mic' + (speaking ? ' on' : '');
        mic.textContent = speaking ? '🎙' : '🔇';
        mic.title = speaking ? 'اكتم مايكه' : 'افتح مايكه';
        mic.addEventListener('click', () => socket.emit('voice:setMic', { id: p.id, on: !speaking }));
        li.appendChild(mic);
      }

      const kick = document.createElement('button');
      kick.className = 'solo-kick';
      kick.textContent = '×';
      kick.title = 'إخراج';
      kick.addEventListener('click', () => socket.emit('solo:kick', { id: p.id }));
      li.appendChild(kick);
      playersList.appendChild(li);
    });
  }
})();
