(() => {
  const socket = io('/solo');

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

  const STORE_KEY = 'solo-buzz-name';
  const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const toArabic = (n) => String(n).replace(/\d/g, d => AR_DIGITS[Number(d)]);
  const me = { id: null, name: null };
  let last = { armed: false, winner: null, players: [], presses: [], round: 1 };
  let lastRound = null;

  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) nameInput.value = saved;
  } catch (_) { /* ignore */ }

  nameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    try { localStorage.setItem(STORE_KEY, name); } catch (_) { /* ignore */ }
    socket.emit('solo:join', { name });
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
        buzzerLabel.textContent = 'بزيت أولاً!';
      } else {
        buzzer.classList.add('locked');
        buzzerLabel.textContent = 'مقفل';
      }
      winnerLine.textContent = `أول من ضغط: ${winner.name}`;
    } else if (last.armed) {
      winnerLine.textContent = '';
      if (iPressed) {
        buzzerLabel.textContent = 'تم الإرسال…';
      } else {
        buzzer.classList.add('armed');
        buzzer.disabled = false;
        buzzerLabel.textContent = 'بز!';
      }
    } else {
      winnerLine.textContent = '';
      buzzerLabel.textContent = 'بانتظار المقدم';
    }

    playersLine.textContent = `جولة ${toArabic(last.round)} — ${toArabic(last.players.length)} مشارك`;
  }

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

  socket.on('solo:joined', ({ id, name }) => {
    me.id = id;
    me.name = name;
    meName.textContent = name;
    nameView.hidden = true;
    buzzView.hidden = false;
    nameError.hidden = true;
    render();
  });

  socket.on('solo:joinRejected', ({ reason }) => {
    nameError.textContent = reason || 'تعذّر الدخول';
    nameError.hidden = false;
  });

  socket.on('solo:state', (snap) => {
    last = snap;
    if (lastRound !== null && snap.round !== lastRound && navigator.vibrate) {
      try { navigator.vibrate(20); } catch (_) { /* ignore */ }
    }
    lastRound = snap.round;
    render();
  });

  socket.on('solo:kicked', () => { location.reload(); });
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
