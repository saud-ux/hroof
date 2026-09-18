(() => {
  // WebSocket first. socket.io otherwise opens on HTTP long-polling and only
  // upgrades a moment later, and every event sent in that window waits for the
  // next poll — which is exactly the lag between the host opening a cell and
  // the phones seeing it. Polling stays as the fallback if the upgrade fails.
  const socket = io('/solo', { transports: ['websocket', 'polling'] });

  const teamView = document.getElementById('team-view');
  const teamCards = document.getElementById('team-cards');
  const chosenTeam = document.getElementById('chosen-team');
  const backTeams = document.getElementById('back-teams');
  const colorRow = document.getElementById('color-row');
  const colorSwatches = document.getElementById('color-swatches');
  const nameView = document.getElementById('name-view');
  const buzzView = document.getElementById('buzz-view');
  const nameForm = document.getElementById('name-form');
  const nameInput = document.getElementById('name-input');
  const nameError = document.getElementById('name-error');
  const lobbyCount = document.getElementById('lobby-count');
  const meName = document.getElementById('me-name');
  const meTeam = document.getElementById('me-team');
  const meSwitch = document.getElementById('me-switch');
  const voiceBar = document.getElementById('voice-bar');
  const buzzer = document.getElementById('buzzer');
  const buzzerLabel = document.getElementById('buzzer-label');
  const winnerLine = document.getElementById('winner-line');
  const voiceBtn = document.getElementById('voice-btn');
  const voiceStatus = document.getElementById('voice-status');
  const micMeter = document.getElementById('mic-meter');
  const micLevel = document.getElementById('mic-level');
  const timerDisplay = document.getElementById('timer-display');
  const miniScores = document.getElementById('mini-scores');
  const cellBoard = document.getElementById('cell-board');
  const cellGridEl = document.getElementById('cell-grid');
  const cellBoardOpen = document.getElementById('cell-board-open');
  const cellBoardLetter = document.getElementById('cell-board-letter');
  const cellBoardWin = document.getElementById('cell-board-win');

  const STORE_KEY = 'solo-buzz-name';
  const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const toArabic = (n) => String(n).replace(/\d/g, d => AR_DIGITS[Number(d)]);

  // Names come from other people's phones, so they never go into innerHTML raw.
  const esc = (t) => String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const me = { id: null, name: null, color: null, teamId: null, teamName: null };
  let last = { armed: false, winner: null, players: [], presses: [], round: 1, teams: [], palette: [] };
  let lastRound = null;
  let pickedTeamId = null;   // chosen on the team screen, sent with the join
  let pickedColor = null;    // free-for-all mode only

  const STORE_TEAM = 'solo-buzz-team';
  const STORE_COLOR = 'solo-buzz-color';
  const SKIP_AUTO = 'solo-buzz-skip-auto';   // sessionStorage: one load only
  let autoJoined = false;
  let prevArmed = false;
  let prevWinnerId = null;

  // Android vibrates. iOS Safari has no vibration API, but since iOS 18 toggling
  // a native switch control gives a light haptic tick; it only fires inside a
  // tap, so on iPhone the press is felt and the other cues stay silent.
  const buzz = (pattern) => {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (_) { /* ignore */ }
      return;
    }
    try {
      const label = document.createElement('label');
      label.ariaHidden = 'true';
      label.style.display = 'none';
      const sw = document.createElement('input');
      sw.type = 'checkbox';
      sw.setAttribute('switch', '');
      label.appendChild(sw);
      document.head.appendChild(label);
      label.click();
      label.remove();
    } catch (_) { /* ignore */ }
  };

  // Safari starts audio suspended until a tap, so a beep created later by a
  // timer stays silent. One context, woken on the first touch, fixes that.
  let audioCtx = null;
  function unlockAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (_) { /* ignore */ }
  }
  ['pointerdown', 'touchend', 'keydown'].forEach(type =>
    document.addEventListener(type, unlockAudio, { capture: true, passive: true }));

  // A compact live standing so a player can follow the match without the
  // presenter reading the score out after every round.
  function renderMiniScores() {
    const rows = last.scores || [];
    const scored = rows.filter(r => r.points !== 0);
    // Nothing to show before anyone is on the board, or in a free-for-all with
    // too many names to fit across a phone.
    const show = scored.length > 0 && rows.length <= 6;
    miniScores.hidden = !show;
    if (!show) return;

    const mineKey = myScoreKey();
    miniScores.innerHTML = '';
    rows.forEach(r => {
      const chip = document.createElement('span');
      chip.className = 'score-chip' + (r.key === mineKey ? ' me' : '');
      chip.style.setProperty('--tint', r.color || '#6b7280');
      chip.innerHTML = `<b>${toArabic(r.points)}</b><span>${esc(r.name)}</span>`;
      miniScores.appendChild(chip);
    });
  }

  function myScoreKey() {
    if (!me.id) return null;
    return me.teamId != null ? `t:${me.teamId}` : `n:${me.name}`;
  }

  // ---- لعبة الخلية: نفس لوحة المقدم، عرضًا فقط فوق الزر ----
  const cellGrid = (cellGridEl && window.createCellGrid)
    ? window.createCellGrid({ root: cellGridEl, interactive: false })
    : null;

  function renderCellBoard() {
    const cell = last.cell;
    const on = last.mode === 'cell' && !!cell && !!cellGrid;
    cellBoard.hidden = !on;
    // The buzzer keeps a floor of screen height while the board is up.
    buzzView.classList.toggle('with-cell', on);
    if (!on) return;

    cellGrid.render(cell, last.teams || []);

    const letter = cell.open != null ? (cell.letters[cell.open] || '') : '';
    cellBoardOpen.hidden = !letter || !!cell.win;
    if (letter) cellBoardLetter.textContent = letter;

    if (cell.win) {
      const t = (last.teams || []).find(x => x.id === cell.win.team);
      cellBoardWin.hidden = false;
      cellBoardWin.textContent = t ? `🏆 فاز ${t.name}` : '🏆 انتهت اللعبة';
      cellBoardWin.style.setProperty('--tint', t ? t.color : '#22c55e');
    } else {
      cellBoardWin.hidden = true;
    }
  }

  function setButtonColor(color) {
    // The buzzer wears the team's colour, the way it does in the Cell game.
    document.documentElement.style.setProperty('--team-current', color || '#22c55e');
  }

  let savedName = null;
  try {
    savedName = localStorage.getItem(STORE_KEY);
    if (savedName) nameInput.value = savedName;
    const savedTeam = localStorage.getItem(STORE_TEAM);
    if (savedTeam) pickedTeamId = Number(savedTeam) || null;
    const savedColor = localStorage.getItem(STORE_COLOR);
    if (savedColor) pickedColor = savedColor;
  } catch (_) { /* ignore */ }

  // ---- Entry screens ----
  function teamMode() { return Array.isArray(last.teams) && last.teams.length > 0; }

  // Coming back to the page is not signing up again: the phone remembers who
  // this is and walks straight back in with the same name, team and points.
  // Being kicked, cleared out or moved between teams cancels that for one load,
  // otherwise a phone would walk back into a room the host just emptied.
  function autoJoin() {
    if (me.id || autoJoined) return false;
    if (!savedName) return false;
    try { if (sessionStorage.getItem(SKIP_AUTO)) return false; } catch (_) { /* ignore */ }
    if (teamMode()) {
      if (pickedTeamId == null) return false;
      if (!last.teams.some(t => t.id === pickedTeamId)) return false;
    }
    autoJoined = true;
    socket.emit('solo:join', {
      name: savedName,
      teamId: teamMode() ? pickedTeamId : undefined,
      color: teamMode() ? undefined : (pickedColor || undefined),
    });
    return true;
  }

  function skipAutoJoinOnce() {
    try { sessionStorage.setItem(SKIP_AUTO, '1'); } catch (_) { /* ignore */ }
  }

  // The way back out: forget this phone's identity and start over.
  meSwitch.addEventListener('click', () => {
    try {
      localStorage.removeItem(STORE_KEY);
      localStorage.removeItem(STORE_TEAM);
      localStorage.removeItem(STORE_COLOR);
    } catch (_) { /* ignore */ }
    skipAutoJoinOnce();
    socket.emit('solo:leave');
    location.reload();
  });

  function showEntry() {
    if (me.id) return;
    if (autoJoin()) return;   // no entry screen at all for a returning phone
    if (teamMode() && pickedTeamId == null) {
      teamView.hidden = false;
      nameView.hidden = true;
      renderTeamCards();
    } else {
      teamView.hidden = true;
      nameView.hidden = false;
      renderNameScreen();
    }
  }

  function renderTeamCards() {
    teamCards.innerHTML = '';
    last.teams.forEach(t => {
      const count = last.players.filter(p => p.teamId === t.id).length;
      const btn = document.createElement('button');
      btn.className = 'team-card';
      btn.style.setProperty('--team', t.color);
      btn.innerHTML = `
        <span class="team-swatch"></span>
        <span class="team-card-name">${esc(t.name)}</span>
        <span class="team-card-status">${count ? `${toArabic(count)} لاعب` : 'لا أحد بعد'}</span>
      `;
      btn.addEventListener('click', () => {
        pickedTeamId = t.id;
        try { localStorage.setItem(STORE_TEAM, String(t.id)); } catch (_) { /* ignore */ }
        setButtonColor(t.color);
        showEntry();
      });
      teamCards.appendChild(btn);
    });
  }

  function renderNameScreen() {
    if (teamMode()) {
      const t = last.teams.find(x => x.id === pickedTeamId);
      chosenTeam.hidden = !t;
      if (t) {
        chosenTeam.textContent = t.name;
        setButtonColor(t.color);
      }
      colorRow.hidden = true;        // the team's colour wins
      backTeams.hidden = false;
    } else {
      chosenTeam.hidden = true;
      backTeams.hidden = true;
      colorRow.hidden = false;
      renderSwatches();
    }
  }

  const COLOR_NAMES = {
    '#22c55e': 'أخضر', '#60a5fa': 'أزرق', '#fb923c': 'برتقالي', '#c084fc': 'بنفسجي',
    '#facc15': 'أصفر', '#f472b6': 'وردي', '#2dd4bf': 'فيروزي', '#f87171': 'أحمر',
  };

  function renderSwatches() {
    const palette = last.palette || [];
    if (!palette.length) { colorRow.hidden = true; return; }
    if (!pickedColor) pickedColor = palette[0];
    colorSwatches.innerHTML = '';
    palette.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'color-swatch' + (c === pickedColor ? ' active' : '');
      b.style.setProperty('--sw', c);
      b.setAttribute('aria-pressed', c === pickedColor ? 'true' : 'false');
      b.setAttribute('aria-label', COLOR_NAMES[c] || 'لون');
      b.addEventListener('click', () => {
        pickedColor = c;
        setButtonColor(c);
        renderSwatches();
      });
      colorSwatches.appendChild(b);
    });
    setButtonColor(pickedColor);
  }

  backTeams.addEventListener('click', () => {
    pickedTeamId = null;
    try { localStorage.removeItem(STORE_TEAM); } catch (_) { /* ignore */ }
    showEntry();
  });

  nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    savedName = name;
    try {
      localStorage.setItem(STORE_KEY, name);
      if (!teamMode() && pickedColor) localStorage.setItem(STORE_COLOR, pickedColor);
      sessionStorage.removeItem(SKIP_AUTO);
    } catch (_) { /* ignore */ }
    socket.emit('solo:join', {
      name,
      teamId: teamMode() ? pickedTeamId : undefined,
      color: teamMode() ? undefined : pickedColor,
    });
  });

  function render() {
    renderCellBoard();
    if (!me.id) {
      lobbyCount.textContent = last.players.length
        ? `في الغرفة الآن: ${toArabic(last.players.length)}`
        : '';
      return;
    }

    const winner = last.winner;
    const iPressed = last.presses.some(p => p.id === me.id);
    const iWon = winner && winner.id === me.id;

    // Haptics mark the moments a player might miss while watching the host.
    const wasArmed = prevArmed;
    const hadWinner = prevWinnerId;
    prevArmed = !!last.armed && !winner;
    prevWinnerId = winner ? winner.id : null;
    if (winner && winner.id !== hadWinner) buzz(iWon ? [70, 50, 140] : 25);
    else if (prevArmed && !wasArmed && !iPressed) buzz(30);

    buzzer.classList.remove('armed', 'locked', 'pressed', 'waiting', 'sent');
    buzzView.classList.remove('win');
    buzzView.classList.toggle('live', prevArmed && !iPressed);
    buzzer.disabled = true;

    if (winner) {
      if (iWon) {
        buzzView.classList.add('win');
        buzzerLabel.textContent = 'ضغطت أولا!';
      } else {
        buzzer.classList.add('locked');
        buzzerLabel.textContent = 'مقفل';
      }
      winnerLine.innerHTML = `أول من ضغط: <span class="who-person">${esc(winner.name)}</span>`
        + (winner.teamName
          ? `<span class="team-tag" style="--tint:${esc(winner.color) || '#22c55e'}">${esc(winner.teamName)}</span>`
          : '');
    } else if (last.armed) {
      winnerLine.textContent = '';
      if (iPressed) {
        buzzer.classList.add('sent');
        buzzerLabel.textContent = 'تم الإرسال…';
      } else {
        buzzer.classList.add('armed');
        buzzer.disabled = false;
        buzzerLabel.textContent = 'اضغط';
      }
    } else {
      winnerLine.textContent = '';
      buzzer.classList.add('waiting');
      buzzerLabel.textContent = 'بانتظار الهوست';
    }

    renderMiniScores();

    // The microphone only exists once the host opens the channel.
    const voiceOn = !!last.voiceEnabled;
    voiceBar.hidden = !voiceOn;
    if (!voiceOn && voice && voice.isJoined()) {
      voice.leave();
      ZIcon.setLabel(voiceBtn, 'mic', 'انضم للصوت');
    }
  }

  // ---- Voice ----
  const voice = window.createVoice({
    socket,
    isHost: false,
    onStatus: (text, state) => {
      voiceStatus.textContent = text;
      voiceStatus.dataset.state = state || '';
    },
    onRoom: () => {
      if (voice.isJoined()) ZIcon.setLabel(voiceBtn, 'mic-off', 'خروج من الصوت'); else ZIcon.setLabel(voiceBtn, 'mic', 'انضم للصوت');
    },
    onLevel: (v, open) => {
      micMeter.hidden = !voice.isJoined();
      micMeter.dataset.open = open ? '1' : '0';
      micLevel.style.width = `${Math.round(v * 100)}%`;
    },
  });

  voiceBtn.addEventListener('click', async () => {
    if (!me.id) return;
    if (voice.isJoined()) {
      voice.leave();
      ZIcon.setLabel(voiceBtn, 'mic', 'انضم للصوت');
      return;
    }
    voiceBtn.disabled = true;
    const ok = await voice.join(me.id);
    voiceBtn.disabled = false;
    if (ok) ZIcon.setLabel(voiceBtn, 'mic-off', 'خروج من الصوت');
  });

  const press = (e) => {
    if (e) e.preventDefault();
    if (buzzer.disabled) return;
    buzzer.disabled = true;           // one press per round, however fast the thumbs
    buzzer.classList.add('pressed');
    buzz(40);
    socket.emit('solo:press');
    // The server answers with a state broadcast; if a dropped packet means it
    // never does, re-render so the button is not left dead.
    setTimeout(render, 1500);
  };
  buzzer.addEventListener('pointerdown', press);
  buzzer.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  buzzer.addEventListener('click', (e) => e.preventDefault());

  // In a race a thumb lands near the disc as often as on it: while the button
  // is live, the whole middle of the screen presses it.
  const buzzerMain = buzzer.closest('.buzzer-main');
  if (buzzerMain) {
    buzzerMain.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#buzzer') || buzzer.disabled) return;
      press(e);
    });
  }

  // Keep the phone awake between rounds (needs HTTPS or localhost).
  let wakeLock = null;
  async function keepAwake() {
    if (!('wakeLock' in navigator) || buzzView.hidden || document.visibilityState !== 'visible') return;
    if (wakeLock && !wakeLock.released) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch (_) { /* battery saver, etc. */ }
  }

  // Space bar for laptops
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && me.id && !buzzer.disabled) press(e);
  });

  socket.on('solo:joined', ({ id, name, color, teamId, teamName }) => {
    me.id = id;
    me.name = name;
    me.color = color;
    me.teamId = teamId ?? null;
    me.teamName = teamName || null;
    setButtonColor(color);
    meName.textContent = name;
    meTeam.hidden = !teamName;
    if (teamName) {
      meTeam.textContent = teamName;
      meTeam.style.setProperty('--tint', color || '#22c55e');
    }
    teamView.hidden = true;
    nameView.hidden = true;
    buzzView.hidden = false;
    nameError.hidden = true;
    voice.setSelfId(id);
    render();
    keepAwake();
  });

  socket.on('solo:joinRejected', ({ reason }) => {
    // An automatic re-entry that the room refuses falls back to the normal
    // screens instead of leaving the phone on nothing.
    autoJoined = true;
    skipAutoJoinOnce();
    showEntry();
    nameError.textContent = reason || 'تعذّر الدخول';
    nameError.hidden = false;
  });

  socket.on('solo:state', (snap) => {
    const hadTeams = teamMode();
    last = snap;
    if (!me.id) {
      // Teams appearing or disappearing swaps which entry screen applies.
      if (hadTeams !== teamMode()) pickedTeamId = teamMode() ? pickedTeamId : null;
      showEntry();
    }
    if (lastRound !== null && snap.round !== lastRound) buzz(20);
    lastRound = snap.round;
    render();
  });

  socket.on('solo:timer', ({ running, remaining }) => {
    timerDisplay.hidden = !running;
    if (running) {
      timerDisplay.textContent = toArabic(remaining);
      timerDisplay.classList.toggle('urgent', remaining <= 3);
    }
  });

  socket.on('solo:timerEnd', () => {
    timerDisplay.hidden = false;
    timerDisplay.textContent = 'انتهى';
    timerDisplay.classList.add('urgent');
    playTimerEnd();
    setTimeout(() => { timerDisplay.hidden = true; timerDisplay.classList.remove('urgent'); }, 2500);
  });

  function playTimerEnd() {
    try {
      unlockAudio();
      const ctx = audioCtx;
      if (!ctx) return;
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

  socket.on('solo:kicked', () => { skipAutoJoinOnce(); location.reload(); });
  socket.on('solo:teamsChanged', () => {
    try { localStorage.removeItem(STORE_TEAM); } catch (_) { /* ignore */ }
    skipAutoJoinOnce();
    location.reload();
  });
  socket.on('solo:cleared', () => { skipAutoJoinOnce(); location.reload(); });

  // The host closed the voice channel: drop the mic without waiting for a state.
  socket.on('voice:closed', () => {
    if (voice.isJoined()) voice.leave();
    ZIcon.setLabel(voiceBtn, 'mic', 'انضم للصوت');
    voiceBar.hidden = true;
  });

  // Re-join automatically after a reconnect so a dropped phone comes back ready.
  // The team and colour must travel too: in team mode the server refuses a
  // join without a team, which left a phone stuck after every screen lock.
  socket.on('connect', () => {
    if (me.name) {
      socket.emit('solo:join', {
        name: me.name,
        teamId: me.teamId ?? undefined,
        color: me.teamId == null ? me.color : undefined,
      });
    }
  });

  // Safari freezes a backgrounded or locked tab and may hand it back with a
  // dead socket; reconnect straight away instead of waiting for a timeout.
  const wake = () => {
    if (document.visibilityState !== 'visible') return;
    if (!socket.connected) socket.connect();
    keepAwake();
  };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('pageshow', wake);
  window.addEventListener('focus', wake);

  socket.on('disconnect', () => {
    buzzer.disabled = true;
    buzzer.classList.remove('armed', 'waiting');
    buzzView.classList.add('offline');
    buzzerLabel.textContent = 'انقطع الاتصال…';
  });

  socket.on('connect', () => { buzzView.classList.remove('offline'); });
})();
