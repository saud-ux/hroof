(() => {
  const socket = io();

  const selectView = document.getElementById('select-view');
  const buzzerView = document.getElementById('buzzer-view');
  const cardsWrap = document.getElementById('team-cards');
  const emptyNote = document.getElementById('empty-note');
  const banner = document.getElementById('team-banner');
  const bannerName = document.getElementById('banner-name');
  const buzzer = document.getElementById('buzzer');
  const buzzerLabel = document.getElementById('buzzer-label');
  const timerSound = document.getElementById('timer-sound');

  const state = {
    myTeamId: null,
    myColor: null,
    myName: null,
    roster: [],           // [{id,name,color,connected}]
    matchTeamIds: [],     // ids currently in the match
    serverStatus: 'setup',
    buzzWinner: null,     // teamId in the current match
    currentAnswerer: null, // team currently in an answer window (during Phase 2), or null
    audioUnlocked: false,
  };

  function setColorVars(color) {
    document.documentElement.style.setProperty('--team-current', color);
  }

  function renderRoster() {
    cardsWrap.innerHTML = '';
    if (!state.roster.length) {
      emptyNote.hidden = false;
      return;
    }
    emptyNote.hidden = true;
    state.roster.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'team-card';
      btn.style.borderColor = t.color;
      btn.dataset.team = String(t.id);
      const taken = t.connected && t.id !== state.myTeamId;
      btn.disabled = taken;
      btn.innerHTML = `
        <span class="team-card-name">${t.name}</span>
        <span class="team-card-status">${t.connected ? 'متصل' : ''}</span>
      `;
      btn.addEventListener('click', () => {
        unlockAudio();
        socket.emit('team:join', { teamId: t.id });
      });
      cardsWrap.appendChild(btn);
    });
  }

  function amInCurrentMatch() {
    return state.myTeamId && state.matchTeamIds.includes(state.myTeamId);
  }

  function showSelect() {
    selectView.hidden = false;
    buzzerView.hidden = true;
    buzzerView.classList.remove('win');
    renderRoster();
  }
  function showBuzzer() {
    selectView.hidden = true;
    buzzerView.hidden = false;
  }

  function unlockAudio() {
    if (state.audioUnlocked) return;
    state.audioUnlocked = true;
    try {
      timerSound.volume = 0;
      const p = timerSound.play();
      if (p && typeof p.then === 'function') {
        p.then(() => { timerSound.pause(); timerSound.currentTime = 0; timerSound.volume = 1; }).catch(() => {});
      }
    } catch (_) { /* ignore */ }
  }

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

  function renderBuzzerFor(serverStatus) {
    if (!state.myTeamId) return;
    buzzer.classList.remove('armed', 'locked', 'pressed');
    buzzerView.classList.remove('win');
    buzzer.disabled = true;
    buzzer.style.background = '';
    buzzer.style.color = '';

    // If my team isn't in the current match, this phone is a spectator
    if (!amInCurrentMatch()) {
      buzzerLabel.textContent = state.matchTeamIds.length ? 'مباراة فريق آخر' : 'بانتظار مباراة فريقك';
      return;
    }

    // My team IS in the match. Now branch on question state.
    if (serverStatus === 'waiting' || serverStatus === 'noMatch' || serverStatus === 'setup') {
      buzzerLabel.textContent = 'بانتظار السؤال';
      return;
    }
    if (serverStatus === 'questionActive') {
      if (state.buzzWinner === null) {
        buzzer.classList.add('armed');
        buzzer.disabled = false;
        buzzerLabel.textContent = 'بز!';
        return;
      }
    }
    // question is in play but buzz has been resolved (answering1 / timeout1 / answering2 / timeout2)
    if (state.buzzWinner === state.myTeamId) {
      // I buzzed first — persistent win takeover unless the presenter later gives another team the phase-2 window
      if (state.currentAnswerer && state.currentAnswerer !== state.myTeamId) {
        // Someone else is currently answering — I sit quiet but still show my first-buzz status
        buzzerView.classList.add('win');
        buzzerLabel.textContent = 'بزيت أولاً';
      } else {
        buzzerView.classList.add('win');
        buzzerLabel.textContent = 'بزيت أولاً!';
      }
      return;
    }
    if (state.currentAnswerer === state.myTeamId) {
      // Presenter granted me the phase-2 window
      buzzerView.classList.add('win');
      buzzerLabel.textContent = 'دورك للإجابة';
      return;
    }
    // I lost the buzz and am not the current answerer
    buzzer.classList.add('locked');
    buzzerLabel.textContent = 'الخصم بز أولاً';
  }

  // Same one-shot press cue as the solo buzzer: off at the end of the run so
  // the next buzz replays it, re-added after a reflow so it restarts cleanly.
  buzzer.addEventListener('animationend', () => buzzer.classList.remove('just-pressed'));

  const buzzHandler = (e) => {
    if (e) e.preventDefault();
    if (buzzer.disabled) return;
    buzzer.classList.add('pressed');
    buzzer.classList.remove('just-pressed');
    void buzzer.offsetWidth;
    buzzer.classList.add('just-pressed');
    socket.emit('team:buzz');
  };
  buzzer.addEventListener('pointerdown', buzzHandler);
  buzzer.addEventListener('touchstart', (e) => { e.preventDefault(); }, { passive: false });
  buzzer.addEventListener('click', (e) => e.preventDefault());

  // ---- Socket events ----
  socket.on('teams:update', ({ roster, match }) => {
    state.roster = Array.isArray(roster) ? roster : [];
    state.matchTeamIds = match ? [match.teamA.id, match.teamB.id] : [];
    if (state.myTeamId) {
      const me = state.roster.find(t => t.id === state.myTeamId);
      if (me) { state.myColor = me.color; state.myName = me.name; bannerName.textContent = me.name; setColorVars(me.color); }
      renderBuzzerFor(state.serverStatus);
    } else {
      renderRoster();
    }
  });

  socket.on('team:joined', ({ teamId, team }) => {
    state.myTeamId = teamId;
    state.myColor = team.color;
    state.myName = team.name;
    bannerName.textContent = team.name;
    setColorVars(team.color);
    showBuzzer();
    renderBuzzerFor(state.serverStatus);
  });

  socket.on('team:joinRejected', () => { /* card will re-render disabled via teams:update */ });

  socket.on('state:lite', (snap) => {
    state.serverStatus = snap.status;
    state.buzzWinner = snap.buzzWinner;
    state.matchTeamIds = Array.isArray(snap.matchTeamIds) ? snap.matchTeamIds : state.matchTeamIds;
    renderBuzzerFor(state.serverStatus);
  });

  socket.on('question:showTeams', () => {
    state.serverStatus = 'questionActive';
    state.buzzWinner = null;
    state.currentAnswerer = null;
    renderBuzzerFor(state.serverStatus);
  });

  socket.on('buzz:winner', ({ teamId }) => {
    state.buzzWinner = teamId;
    state.currentAnswerer = teamId;
    renderBuzzerFor(state.serverStatus);
  });

  socket.on('answer:startingFor', ({ teamId }) => {
    state.currentAnswerer = teamId;
    renderBuzzerFor(state.serverStatus);
  });

  socket.on('timer:tick', () => { /* teams never render timers */ });

  socket.on('timer:end', () => { playTimerEnd(); });

  socket.on('question:cleared', () => {
    state.serverStatus = 'waiting';
    state.buzzWinner = null;
    state.currentAnswerer = null;
    renderBuzzerFor(state.serverStatus);
  });

  socket.on('match:started', ({ match }) => {
    state.matchTeamIds = match ? [match.teamA.id, match.teamB.id] : [];
    state.buzzWinner = null;
    state.currentAnswerer = null;
    state.serverStatus = 'waiting';
    renderBuzzerFor(state.serverStatus);
  });

  socket.on('match:ended', () => {
    state.matchTeamIds = [];
    state.buzzWinner = null;
    state.currentAnswerer = null;
    state.serverStatus = 'noMatch';
    renderBuzzerFor(state.serverStatus);
  });

  socket.on('session:reset', () => {
    state.myTeamId = null;
    state.buzzWinner = null;
    state.currentAnswerer = null;
    state.matchTeamIds = [];
    state.serverStatus = 'setup';
    showSelect();
  });

  socket.on('disconnect', () => {
    state.myTeamId = null;
    showSelect();
  });
})();
