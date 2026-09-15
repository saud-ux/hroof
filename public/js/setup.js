(() => {
  const socket = io();
  const form = document.getElementById('setup-form');
  const list = document.getElementById('teams-list');
  const addBtn = document.getElementById('add-team');
  const countLabel = document.getElementById('team-count');
  const unlock = document.getElementById('silent-unlock');

  let cfg = { minTeams: 2, maxTeams: 8, palette: ['#22c55e', '#f97316', '#3b82f6', '#a855f7', '#eab308', '#ec4899', '#14b8a6', '#ef4444'] };

  const DEFAULT_NAMES = [
    'الفريق الأخضر', 'الفريق البرتقالي', 'الفريق الأزرق', 'الفريق البنفسجي',
    'الفريق الأصفر', 'الفريق الوردي', 'الفريق الفيروزي', 'الفريق الأحمر',
  ];

  function makeRow(idx, presetName, presetColor) {
    const row = document.createElement('div');
    row.className = 'team-row-dyn';
    row.innerHTML = `
      <span class="team-num">${idx + 1}</span>
      <input type="text" class="team-name" maxlength="40" placeholder="اسم الفريق" required />
      <input type="color" class="team-color" />
      <button type="button" class="btn-icon remove-team" aria-label="حذف">×</button>
    `;
    row.querySelector('.team-name').value = presetName ?? (DEFAULT_NAMES[idx] || `الفريق ${idx + 1}`);
    row.querySelector('.team-color').value = presetColor ?? cfg.palette[idx % cfg.palette.length];
    row.querySelector('.remove-team').addEventListener('click', () => {
      if (list.children.length <= cfg.minTeams) return;
      row.remove();
      renumberAndUpdate();
    });
    return row;
  }

  function renumberAndUpdate() {
    const rows = Array.from(list.children);
    rows.forEach((row, i) => {
      row.querySelector('.team-num').textContent = i + 1;
    });
    countLabel.textContent = `${rows.length} / ${cfg.maxTeams}`;
    addBtn.disabled = rows.length >= cfg.maxTeams;
    rows.forEach(row => {
      row.querySelector('.remove-team').disabled = rows.length <= cfg.minTeams;
    });
  }

  function addRow(name, color) {
    if (list.children.length >= cfg.maxTeams) return;
    const idx = list.children.length;
    list.appendChild(makeRow(idx, name, color));
    renumberAndUpdate();
  }

  addBtn.addEventListener('click', () => addRow());

  fetch('/config').then(r => r.json()).then(c => {
    if (c.minTeams) cfg.minTeams = c.minTeams;
    if (c.maxTeams) cfg.maxTeams = c.maxTeams;
    if (Array.isArray(c.palette) && c.palette.length) cfg.palette = c.palette;
  }).catch(() => {}).finally(() => {
    for (let i = 0; i < cfg.minTeams; i++) addRow();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const teams = Array.from(list.children).map(row => ({
      name: row.querySelector('.team-name').value.trim(),
      color: row.querySelector('.team-color').value,
    })).filter(t => t.name);
    if (teams.length < cfg.minTeams) return;

    try {
      if (unlock) {
        unlock.volume = 0;
        const p = unlock.play();
        if (p && typeof p.then === 'function') {
          p.then(() => { unlock.pause(); unlock.currentTime = 0; unlock.volume = 1; }).catch(() => {});
        }
      }
    } catch (_) { /* ignore */ }

    socket.emit('presenter:setup', { teams });
    setTimeout(() => { window.location.href = '/presenter'; }, 120);
  });
})();
