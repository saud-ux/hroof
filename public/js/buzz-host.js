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

  armBtn.addEventListener('click', () => socket.emit('solo:arm'));
  nextBtn.addEventListener('click', () => socket.emit('solo:nextRound'));
  disarmBtn.addEventListener('click', () => socket.emit('solo:disarm'));
  clearBtn.addEventListener('click', () => {
    if (confirm('تصفير الغرفة يطرد كل المشاركين. متأكد؟')) socket.emit('solo:clearAll');
  });

  socket.on('solo:state', (snap) => {
    roundLabel.textContent = `جولة ${toArabic(snap.round)}`;

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

    playersCount.textContent = toArabic(snap.players.length);
    playersList.innerHTML = '';
    snap.players.forEach(p => {
      const li = document.createElement('li');
      const pressed = snap.presses.some(x => x.id === p.id);
      li.innerHTML = `<span>${p.name}</span>`;
      if (pressed) li.classList.add('pressed');
      const kick = document.createElement('button');
      kick.className = 'solo-kick';
      kick.textContent = '×';
      kick.title = 'إخراج';
      kick.addEventListener('click', () => socket.emit('solo:kick', { id: p.id }));
      li.appendChild(kick);
      playersList.appendChild(li);
    });
  });
})();
