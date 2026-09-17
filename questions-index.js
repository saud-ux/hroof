// Index questions by the letter their answer starts with -------------------------
// In the Cell game each hexagon carries a letter and the answer has to start with
// it. Arabic makes "starts with" ambiguous: an answer like "الرياض" reads as ر once
// you drop the definite article, but as ا if you don't. So every question is filed
// under BOTH readings and matches either letter.

const ARABIC_LETTERS = [
  'ا', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص',
  'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي',
];

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

// Fold the letter shapes that only differ by hamza / final form into one bucket,
// so a cell marked ا also catches أ, إ and آ.
function normalizeLetter(ch) {
  if ('أإآٱا'.includes(ch)) return 'ا';
  if ('ىيئ'.includes(ch)) return 'ي';
  if ('ؤ'.includes(ch)) return 'و';
  if ('ة'.includes(ch)) return 'ه';
  return ch;
}

function stripLeading(text) {
  return String(text || '')
    .replace(DIACRITICS, '')
    .replace(/^[^ء-ي]+/, '') // quotes, brackets, spaces, latin, digits
    .trim();
}

// Every letter this answer can legitimately be filed under (usually one, two when
// the answer opens with the definite article).
function lettersOf(answer) {
  const clean = stripLeading(answer);
  if (!clean) return [];
  const out = [];
  const first = normalizeLetter(clean[0]);
  if (ARABIC_LETTERS.includes(first)) out.push(first);

  // "الرياض" -> also file under ر. Keep "الله", "ألم" and other short words intact.
  if (/^ال/.test(clean) && clean.length > 3) {
    const second = normalizeLetter(clean[2]);
    if (ARABIC_LETTERS.includes(second) && !out.includes(second)) out.push(second);
  }
  return out;
}

// { difficulty: { letter: [question, ...] } }
function buildLetterIndex(questions) {
  const index = {};
  for (const q of questions) {
    const byLetter = index[q.difficulty] || (index[q.difficulty] = {});
    for (const letter of lettersOf(q.answer)) {
      (byLetter[letter] || (byLetter[letter] = [])).push(q);
    }
  }
  return index;
}

// How many unused questions are left for each letter at this difficulty.
function letterCounts(index, difficulty, usedIds) {
  const byLetter = index[difficulty] || {};
  const counts = {};
  for (const letter of ARABIC_LETTERS) {
    const bucket = byLetter[letter] || [];
    counts[letter] = usedIds ? bucket.filter(q => !usedIds.has(q.id)).length : bucket.length;
  }
  return counts;
}

// Pick a random unused question, optionally constrained to a letter.
function pickFrom({ index, byDifficulty, difficulty, letter, usedIds }) {
  const bucket = letter
    ? ((index[difficulty] || {})[letter] || [])
    : (byDifficulty[difficulty] || []);
  const pool = bucket.filter(q => !usedIds.has(q.id));
  if (!pool.length) return null;
  const q = pool[Math.floor(Math.random() * pool.length)];
  usedIds.add(q.id);
  return q;
}

module.exports = { ARABIC_LETTERS, lettersOf, buildLetterIndex, letterCounts, pickFrom, normalizeLetter };
