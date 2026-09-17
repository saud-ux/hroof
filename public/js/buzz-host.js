(() => {
  const socket = io('/solo');

  const roundLabel = document.getElementById('round-label');
  const shareLink = document.getElementById('share-link');
  const copyLink = document.getElementById('copy-link');
  const shareQr = document.getElementById('share-qr');
  const winnerBox = document.getElementById('winner-box');
  const winnerName = document.getElementById('winner-name');
  const winnerMs = document.getElementById('winner-ms');
  const armBtn = document.getElementById('arm-btn');
  const nextBtn = document.getElementById('next-btn');
  const disarmBtn = document.getElementById('disarm-btn');
  const clearBtn = document.getElementById('clear-btn');
  const pressOrder = document.getElementById('press-order');
  const playersList = document.getElementById('players-list');
  const playersCount = document.getElementById('players-count');
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

  const voiceBtn = document.getElementById('voice-btn');
  const voiceStatus = document.getElementById('voice-status');
  const voiceMode = document.getElementById('voice-mode');
  const voiceAllBtn = document.getElementById('voice-all-btn');

  const DIFFS = ['سهل', 'متوسط', 'صعب'];
  const st = { letter: '', letters: [], letterCounts: null, poolCounts: null };

  const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const toArabic = (n) => String(n).replace(/\d/g, d => AR_DIGITS[Number(d)]);

  fetch('/links')
    .then(r => r.json())
    .then(({ buzz }) => { shareLink.textContent = buzz; })
    .catch(() => { shareLink.textContent = `${location.origin}/buzz`; });

  copyLink.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareLink.textContent);
      copyLink.textContent = 'تم النسخ';
      setTimeout(() => { copyLink.textContent = 'نسخ'; }, 1500);
    } catch (_) { /* clipboard blocked on plain http — the link is visible anyway */ }
  });

  shareQr.addEventListener('error', () => { shareQr.hidden = true; });

  socket.on('connect', () => socket.emit('solo:hostRegister'));

  // ---- Voice ----
  let voiceRoom = { members: [], speakers: [], mode: 'winner' };
  let lastSnap = null;
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
  });

  diffRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.diff-pill');
    if (!btn || btn.disabled) return;
    socket.emit('solo:pickQuestion', { difficulty: btn.dataset.diff, letter: st.letter || undefined });
  });

  clearQBtn.addEventListener('click', () => socket.emit('solo:clearQuestion'));

  socket.on('solo:poolEmpty', ({ difficulty, letter }) => {
    alert(letter
      ? `لا توجد أسئلة ${difficulty} تبدأ إجابتها بحرف ${letter}.`
      : `انتهت أسئلة الصعوبة ${difficulty}.`);
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
    if (winner) {
      winnerName.textContent = winner.name;
      winnerMs.textContent = `${toArabic(winner.ms)} مللي ثانية`;
    } else {
      winnerName.textContent = snap.armed ? 'البزّ مفتوح…' : 'مقفل';
      winnerMs.textContent = '';
    }

    armBtn.hidden = !!winner || snap.armed;
    nextBtn.hidden = !winner;
    disarmBtn.hidden = !snap.armed || !!winner;

    pressOrder.innerHTML = '';
    snap.presses.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = i === 0 ? 'first' : '';
      li.innerHTML = `<span>${p.name}</span><span class="solo-ms">${toArabic(p.ms)} م.ث</span>`;
      pressOrder.appendChild(li);
    });

    lastSnap = snap;
    renderPlayers();
  });

  function renderPlayers() {
    const snap = lastSnap;
    if (!snap) return;
    playersCount.textContent = toArabic(snap.players.length);
    playersList.innerHTML = '';
    snap.players.forEach(p => {
      const li = document.createElement('li');
      const pressed = snap.presses.some(x => x.id === p.id);
      li.innerHTML = `<span>${p.name}</span>`;
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
