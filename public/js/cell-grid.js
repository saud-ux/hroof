// شبكة الخلية — رسم السداسيات ---------------------------------------------------
// وحدة عرض واحدة تستخدمها لوحة المقدم (خريطة تفاعلية) وجوال اللاعب (عرض فقط)،
// حتى يرى الاثنان نفس اللوحة بنفس الحساب. لا مكتبات: SVG مرسوم بالحساب.
(() => {
  const NS = 'http://www.w3.org/2000/svg';

  const S = 10;                       // نصف قطر السداسي
  const W1 = Math.sqrt(3) * S;        // عرض السداسي (رأسه لأعلى)
  const VERT = 1.5 * S;               // المسافة الرأسية بين مركزي صفين
  const MARGIN = 5;                   // هامش يتسع لأشرطة الحواف والتوهج
  const BAR = 2;                      // سُمك شريط الحافة
  const BAR_GAP = 1.2;
  const LONG_PRESS_MS = 450;

  const TEAM_A = 1;
  const TEAM_B = 2;
  const BURNED = 'burn';

  // ست زوايا لسداسي رأسه لأعلى.
  function hexPoints(cx, cy) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      pts.push(`${(cx + S * Math.cos(angle)).toFixed(2)},${(cy + S * Math.sin(angle)).toFixed(2)}`);
    }
    return pts.join(' ');
  }

  function createCellGrid(opts) {
    const {
      root,
      rows = 5,
      cols = 5,
      interactive = false,   // لوحة المقدم فقط
      onOpen = () => {},     // ضغطة قصيرة على خلية
      onMenu = () => {},     // ضغطة مطوّلة أو زر يمين: التلوين اليدوي
    } = opts;

    const gridW = W1 * cols + W1 / 2;
    const gridH = VERT * (rows - 1) + 2 * S;
    const width = gridW + MARGIN * 2;
    const height = gridH + MARGIN * 2;

    // الأعمدة تُرسم من اليمين إلى اليسار: العمود الأول هو أقصى اليمين على الشاشة،
    // فيقرأ الجمهور الشبكة بنفس اتجاه الواجهة.
    const centerX = (r, c) => MARGIN + gridW - (W1 * (c + 0.5 * (r % 2)) + W1 / 2);
    const centerY = (r) => MARGIN + S + r * VERT;

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width.toFixed(2)} ${height.toFixed(2)}`);
    svg.setAttribute('class', 'cellgrid-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'شبكة حروف الخلية');

    // أشرطة الحواف: الأعلى والأسفل للفريق الأول، اليمين واليسار للفريق الثاني.
    const edges = document.createElementNS(NS, 'g');
    edges.setAttribute('class', 'cellgrid-edges');
    const mkBar = (x, y, w, h, cls) => {
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', x.toFixed(2));
      rect.setAttribute('y', y.toFixed(2));
      rect.setAttribute('width', w.toFixed(2));
      rect.setAttribute('height', h.toFixed(2));
      rect.setAttribute('rx', '1');
      rect.setAttribute('class', cls);
      edges.appendChild(rect);
      return rect;
    };
    const barTop = mkBar(MARGIN, MARGIN - BAR_GAP - BAR, gridW, BAR, 'edge-a');
    const barBottom = mkBar(MARGIN, MARGIN + gridH + BAR_GAP, gridW, BAR, 'edge-a');
    const barRight = mkBar(MARGIN + gridW + BAR_GAP, MARGIN, BAR, gridH, 'edge-b');
    const barLeft = mkBar(MARGIN - BAR_GAP - BAR, MARGIN, BAR, gridH, 'edge-b');
    svg.appendChild(edges);

    const cellsGroup = document.createElementNS(NS, 'g');
    cellsGroup.setAttribute('class', 'cellgrid-cells');
    svg.appendChild(cellsGroup);

    const winLine = document.createElementNS(NS, 'polyline');
    winLine.setAttribute('class', 'cellgrid-winline');
    winLine.setAttribute('points', '');
    winLine.setAttribute('fill', 'none');
    svg.appendChild(winLine);

    // خلية واحدة = مجموعة فيها السداسي وحرفه، تُبنى مرة ثم تُحدَّث صفاتها فقط
    // حتى لا تنقطع الأنيميشن عند كل بث من الخادم.
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const cx = centerX(r, c);
        const cy = centerY(r);

        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'hex');
        g.dataset.index = String(i);

        const poly = document.createElementNS(NS, 'polygon');
        poly.setAttribute('points', hexPoints(cx, cy));
        g.appendChild(poly);

        const text = document.createElementNS(NS, 'text');
        text.setAttribute('x', cx.toFixed(2));
        text.setAttribute('y', cy.toFixed(2));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'central');
        g.appendChild(text);

        cellsGroup.appendChild(g);
        cells.push({ g, poly, text, cx, cy, owner: undefined, letter: undefined });
      }
    }

    root.classList.add('cellgrid');
    root.classList.toggle('is-interactive', !!interactive);
    root.appendChild(svg);

    // ---- التفاعل (لوحة المقدم) ----
    if (interactive) {
      let pressTimer = null;
      let longFired = false;

      const indexFrom = (e) => {
        const g = e.target.closest ? e.target.closest('.hex') : null;
        return g ? Number(g.dataset.index) : null;
      };

      svg.addEventListener('pointerdown', (e) => {
        const i = indexFrom(e);
        if (i == null) return;
        longFired = false;
        clearTimeout(pressTimer);
        pressTimer = setTimeout(() => {
          longFired = true;
          onMenu(i);
        }, LONG_PRESS_MS);
      });

      const cancel = () => { clearTimeout(pressTimer); pressTimer = null; };
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(t =>
        svg.addEventListener(t, cancel));

      svg.addEventListener('click', (e) => {
        const i = indexFrom(e);
        if (i == null) return;
        if (longFired) { longFired = false; return; }
        onOpen(i);
      });

      svg.addEventListener('contextmenu', (e) => {
        const i = indexFrom(e);
        if (i == null) return;
        e.preventDefault();
        cancel();
        onMenu(i);
      });
    }

    function teamColor(teams, id) {
      const t = (teams || []).find(x => x.id === id);
      return t ? t.color : (id === TEAM_A ? '#22c55e' : '#fb923c');
    }

    function render(state, teams) {
      if (!state) return;
      const letters = state.letters || [];
      const owners = state.owners || [];
      const win = state.win || null;
      const winSet = new Set(win ? win.path : []);

      const colorA = teamColor(teams, TEAM_A);
      const colorB = teamColor(teams, TEAM_B);
      barTop.style.fill = colorA;
      barBottom.style.fill = colorA;
      barRight.style.fill = colorB;
      barLeft.style.fill = colorB;

      cells.forEach((cell, i) => {
        const letter = letters[i] || '';
        if (cell.letter !== letter) {
          cell.text.textContent = letter;
          cell.letter = letter;
        }

        const owner = owners[i] ?? null;
        const isOpen = state.open === i;
        const g = cell.g;

        // الصفوف تُبثّ كثيرًا؛ لا نلمس الصفات إلا عند تغيّر فعلي حتى تبقى
        // أنيميشن التلوّن مرتبطة بالتغيير نفسه.
        if (cell.owner !== owner) {
          g.classList.toggle('is-a', owner === TEAM_A);
          g.classList.toggle('is-b', owner === TEAM_B);
          g.classList.toggle('is-burn', owner === BURNED);
          g.classList.toggle('is-empty', owner === null);
          if (owner === TEAM_A || owner === TEAM_B) {
            g.style.setProperty('--tint', owner === TEAM_A ? colorA : colorB);
            g.classList.remove('just-taken');
            void root.offsetWidth;     // إعادة تشغيل الأنيميشن من أولها
            g.classList.add('just-taken');
          } else {
            g.style.removeProperty('--tint');
            g.classList.remove('just-taken');
          }
          cell.owner = owner;
        } else if (owner === TEAM_A || owner === TEAM_B) {
          g.style.setProperty('--tint', owner === TEAM_A ? colorA : colorB);
        }

        g.classList.toggle('is-open', isOpen);
        g.classList.toggle('in-win', winSet.has(i));
      });

      if (win && win.path && win.path.length) {
        winLine.setAttribute('points', win.path
          .map(i => `${cells[i].cx.toFixed(2)},${cells[i].cy.toFixed(2)}`).join(' '));
        const winColor = win.team === TEAM_A ? colorA : colorB;
        winLine.style.stroke = '#ffffff';
        winLine.style.filter = `drop-shadow(0 0 1.6px ${winColor}) drop-shadow(0 0 3px rgba(0,0,0,.5))`;
        winLine.classList.add('on');
      } else {
        winLine.setAttribute('points', '');
        winLine.classList.remove('on');
      }

      root.classList.toggle('has-win', !!win);
    }

    return { render, svg };
  }

  window.createCellGrid = createCellGrid;
})();
