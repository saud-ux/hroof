// لعبة الخلية — شبكة الحروف السداسية -------------------------------------------
// منطق الشبكة وحده: الحروف، الجيران، وفحص الفوز. لا يعرف شيئًا عن السوكِت أو
// الغرفة، فيمكن اختباره وحده ويستدعيه solo-buzz.js عند كل تغيير.

// قائمة الحروف القابلة للتعديل: منها تُسحب حروف كل جولة بدون تكرار.
// احذف أو أضف ما تشاء — يكفي أن يبقى عددها ٢٥ فأكثر.
const CELL_LETTERS = [
  'ا', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص',
  'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي',
];

const ROWS = 5;
const COLS = 5;
const CELL_COUNT = ROWS * COLS;

// حالات الخلية: null فارغة، 1 للفريق الأول، 2 للفريق الثاني، 'burn' محروقة.
const TEAM_A = 1;   // يربط أعلى الشبكة بأسفلها
const TEAM_B = 2;   // يربط أقصى اليمين بأقصى اليسار
const BURNED = 'burn';

const OWNERS = [null, TEAM_A, TEAM_B, BURNED];

const idx = (row, col) => row * COLS + col;
const rowOf = (i) => Math.floor(i / COLS);
const colOf = (i) => i % COLS;
const isIndex = (i) => Number.isInteger(i) && i >= 0 && i < CELL_COUNT;
const isOwner = (o) => OWNERS.includes(o);

// الصفوف الفردية مزاحة نصف خلية إلى اليسار في إحداثيات الشبكة، فجيران الخلية
// تختلف بين الصف الزوجي والفردي. هذه هي إزاحات odd-r المعروفة.
const EVEN_ROW_STEPS = [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
const ODD_ROW_STEPS = [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]];

function neighborsOf(i) {
  if (!isIndex(i)) return [];
  const r = rowOf(i);
  const c = colOf(i);
  const steps = (r % 2 === 0) ? EVEN_ROW_STEPS : ODD_ROW_STEPS;
  const out = [];
  for (const [dr, dc] of steps) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
    out.push(idx(nr, nc));
  }
  return out;
}

// حروف جولة جديدة: ٢٥ حرفًا بلا تكرار من القائمة أعلاه (خلط فيشر–ييتس).
function rollLetters() {
  const pool = CELL_LETTERS.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // لو كانت القائمة أقصر من ٢٥ نُكمل بالدوران عليها بدل أن تنكسر الشبكة.
  const out = [];
  for (let i = 0; i < CELL_COUNT; i++) out.push(pool[i % pool.length]);
  return out;
}

function emptyOwners() {
  return new Array(CELL_COUNT).fill(null);
}

// خلايا حافة البداية وشرط الوصول للحافة المقابلة لكل فريق.
function edgesFor(team) {
  if (team === TEAM_A) {
    return {
      starts: Array.from({ length: COLS }, (_, c) => idx(0, c)),
      reached: (i) => rowOf(i) === ROWS - 1,
    };
  }
  return {
    starts: Array.from({ length: ROWS }, (_, r) => idx(r, 0)),
    reached: (i) => colOf(i) === COLS - 1,
  };
}

// بحث بالعرض من خلايا الحافة المملوكة للفريق حتى الحافة المقابلة.
// يُرجع مسار الفوز نفسه ليُبرز على الشاشة، أو null إن لم يكتمل الخط.
function findWinFor(owners, team) {
  const { starts, reached } = edgesFor(team);
  const parent = new Map();
  const queue = [];

  for (const s of starts) {
    if (owners[s] !== team) continue;
    parent.set(s, null);
    queue.push(s);
  }

  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (reached(cur)) {
      const path = [];
      for (let node = cur; node != null; node = parent.get(node)) path.push(node);
      return { team, path: path.reverse() };
    }
    for (const n of neighborsOf(cur)) {
      if (parent.has(n) || owners[n] !== team) continue;
      parent.set(n, cur);
      queue.push(n);
    }
  }
  return null;
}

// الفريق الأول له الأولوية في الفحص؛ لا يمكن عمليًا أن يكتمل الخطان معًا.
function findWin(owners) {
  return findWinFor(owners, TEAM_A) || findWinFor(owners, TEAM_B);
}

module.exports = {
  CELL_LETTERS,
  ROWS,
  COLS,
  CELL_COUNT,
  TEAM_A,
  TEAM_B,
  BURNED,
  idx,
  rowOf,
  colOf,
  isIndex,
  isOwner,
  neighborsOf,
  rollLetters,
  emptyOwners,
  findWin,
};
