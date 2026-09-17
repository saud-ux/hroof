(() => {
  const socket = io('/solo');

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
  const buzzer = document.getElementById('buzzer');
  const buzzerLabel = document.getElementById('buzzer-label');
  const winnerLine = document.getElementById('winner-line');
  const playersLine = document.getElementById('players-line');
  const voiceBtn = document.getElementById('voice-btn');
  const voiceStatus = document.getElementById('voice-status');
  const micMeter = document.getElementById('mic-meter');
  const micLevel = document.getElementById('mic-level');

  const STORE_KEY = 'solo-buzz-name';
  const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const toArabic = (n) => String(n).replace(/\d/g, d => AR_DIGITS[Number(d)]);
  const me = { id: null, name: null, color: null, teamId: null, teamName: null };
  let last = { armed: false, winner: null, players: [], presses: [], round: 1, teams: [], palette: [] };
  let lastRound = null;
  let pickedTeamId = null;   // chosen on the team screen, sent with the join
  let pickedColor = null;    // free-for-all mode only

  const STORE_TEAM = 'solo-buzz-team';

  function setButtonColor(color) {
    // The buzzer wears the team's colour, the way it does in the Cell game.
    document.documentElement.style.setProperty('--team-current', color || '#22c55e');
  }

  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) nameInput.value = saved;
    const savedTeam = localStorage.getItem(STORE_TEAM);
    if (savedTeam) pickedTeamId = Number(savedTeam) || null;
  } catch (_) { /* ignore */ }

  // ---- Entry screens ----
  function teamMode() { return Array.isArray(last.teams) && last.teams.length > 0; }

  function showEntry() {
    if (me.id) return;
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
      btn.style.borderColor = t.color;
      btn.innerHTML = `
        <span class="team-card-name">${t.name}</span>
        <span class="team-card-status">${count ? count + ' لاعب' : ''}</span>
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
        chosenTeam.textContent = `فريقك: ${t.name}`;
        chosenTeam.style.color = t.color;
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

  function renderSwatches() {
    const palette = last.palette || [];
    if (!palette.length) { colorRow.hidden = true; return; }
    if (!pickedColor) pickedColor = palette[0];
    colorSwatches.innerHTML = '';
    palette.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'color-swatch' + (c === pickedColor ? ' active' : '');
      b.style.background = c;
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
    try { localStorage.setItem(STORE_KEY, name); } catch (_) { /* ignore */ }
    socket.emit('solo:join', {
      name,
      teamId: teamMode() ? pickedTeamId : undefined,
      color: teamMode() ? undefined : pickedColor,
    });
  });

  function render() {
    if (!me.id) {
      lobbyCount.textContent = last.players.length
        ? `في الغرفة الآن: ${toArabic(last.players.length)}`
        : '';
      return;
    }

    const winner = last.winner;
    const iPressed = last.presses.some(p => p.id === me.id);
    const iWon = winner && winner.id === me.id;

    buzzer.classList.remove('armed', 'locked', 'pressed');
    buzzView.classList.remove('win');
    buzzer.disabled = true;

    if (winner) {
      if (iWon) {
        buzzView.classList.add('win');
        buzzerLabel.textContent = 'ضغطت أولاً!';
      } else {
        buzzer.classList.add('locked');
        buzzerLabel.textContent = 'مقفل';
      }
      winnerLine.textContent = winner.teamName
        ? `أول من ضغط: ${winner.name} — ${winner.teamName}`
        : `أول من ضغط: ${winner.name}`;
    } else if (last.armed) {
      winnerLine.textContent = '';
      if (iPressed) {
        buzzerLabel.textContent = 'تم الإرسال…';
      } else {
        buzzer.classList.add('armed');
        buzzer.disabled = false;
        buzzerLabel.textContent = 'زر';
      }
    } else {
      winnerLine.textContent = '';
      buzzerLabel.textContent = 'بانتظار المقدم';
    }

    playersLine.textContent = `جولة ${toArabic(last.round)} — ${toArabic(last.players.length)} مشارك`;
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
      voiceBtn.textContent = voice.isJoined() ? '🔇 خروج من الصوت' : '🎙 انضم للصوت';
    },
    onLevel: (v) => {
      micMeter.hidden = !voice.isJoined();
      micLevel.style.width = `${Math.round(v * 100)}%`;
    },
  });

  voiceBtn.addEventListener('click', async () => {
    if (!me.id) return;
    if (voice.isJoined()) {
      voice.leave();
      voiceBtn.textContent = '🎙 انضم للصوت';
      return;
    }
    voiceBtn.disabled = true;
    const ok = await voice.join(me.id);
    voiceBtn.disabled = false;
    if (ok) voiceBtn.textContent = '🔇 خروج من الصوت';
  });

  const press = (e) => {
    if (e) e.preventDefault();
    if (buzzer.disabled) return;
    buzzer.classList.add('pressed');
    if (navigator.vibrate) { try { navigator.vibrate(40); } catch (_) { /* ignore */ } }
    socket.emit('solo:press');
  };
  buzzer.addEventListener('pointerdown', press);
  buzzer.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  buzzer.addEventListener('click', (e) => e.preventDefault());

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
    meName.textContent = teamName ? `${name} — ${teamName}` : name;
    teamView.hidden = true;
    nameView.hidden = true;
    buzzView.hidden = false;
    nameError.hidden = true;
    voice.setSelfId(id);
    render();
  });

  socket.on('solo:joinRejected', ({ reason }) => {
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
    if (lastRound !== null && snap.round !== lastRound && navigator.vibrate) {
      try { navigator.vibrate(20); } catch (_) { /* ignore */ }
    }
    lastRound = snap.round;
    render();
  });

  socket.on('solo:kicked', () => { location.reload(); });
  socket.on('solo:teamsChanged', () => {
    try { localStorage.removeItem(STORE_TEAM); } catch (_) { /* ignore */ }
    location.reload();
  });
  socket.on('solo:cleared', () => { location.reload(); });

  // Re-join automatically after a reconnect so a dropped phone comes back ready.
  socket.on('connect', () => {
    if (me.name) socket.emit('solo:join', { name: me.name });
  });

  socket.on('disconnect', () => {
    buzzer.disabled = true;
    buzzerLabel.textContent = 'انقطع الاتصال…';
  });
})();
