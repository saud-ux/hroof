const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const PORT = 3000;
const PHASE1_SECONDS = 5;
const PHASE2_SECONDS = 20;
const TICK_MS = 250;
const MIN_TEAMS = 2;
const MAX_TEAMS = 8;

const DEFAULT_PALETTE = [
  '#22c55e', // green
  '#f97316', // orange
  '#3b82f6', // blue
  '#a855f7', // purple
  '#eab308', // yellow
  '#ec4899', // pink
  '#14b8a6', // teal
  '#ef4444', // red
];

const app = express();
app.use(express.json({ limit: '32kb' }));
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

// ---- Load questions ----------------------------------------------------------
const questionsFile = path.join(__dirname, 'data', 'questions.json');
let questions = [];
try {
  const raw = JSON.parse(fs.readFileSync(questionsFile, 'utf8'));
  questions = Array.isArray(raw) ? raw : (raw.questions || []);
} catch (err) {
  console.error('Failed to load questions.json:', err.message);
  process.exit(1);
}
const byDifficulty = { 'سهل': [], 'متوسط': [], 'صعب': [] };
for (const q of questions) if (byDifficulty[q.difficulty]) byDifficulty[q.difficulty].push(q);

// ---- Game state --------------------------------------------------------------
// Roster: teams that participate in this session's event.
// currentMatch: the two team ids playing right now (or null between matches).
const state = {
  status: 'setup', // setup | waiting | questionActive | answering1 | timeout1 | answering2 | timeout2
  teams: [],       // [{ id, name, color, socketId }]
  currentMatch: null, // { teamAId, teamBId } or null
  currentQuestion: null,
  buzzWinner: null, // teamId or null
  triedTeamIds: [], // teams that have already had an answer window this question
  usedQuestionIds: new Set(),
  timerInterval: null,
  timerRemaining: 0,
  timerPhase: null,
};

function findTeam(id) { return state.teams.find(t => t.id === id); }

function rosterPayload() {
  return state.teams.map(t => ({
    id: t.id,
    name: t.name,
    color: t.color,
    connected: !!t.socketId,
  }));
}

function matchPayload() {
  if (!state.currentMatch) return null;
  const a = findTeam(state.currentMatch.teamAId);
  const b = findTeam(state.currentMatch.teamBId);
  if (!a || !b) return null;
  return {
    teamA: { id: a.id, name: a.name, color: a.color, connected: !!a.socketId },
    teamB: { id: b.id, name: b.name, color: b.color, connected: !!b.socketId },
  };
}

function matchTeamIds() {
  return state.currentMatch ? [state.currentMatch.teamAId, state.currentMatch.teamBId] : [];
}

function isInCurrentMatch(teamId) {
  return matchTeamIds().includes(teamId);
}

function bothMatchTeamsConnected() {
  if (!state.currentMatch) return false;
  const ids = matchTeamIds();
  return ids.every(id => {
    const t = findTeam(id);
    return t && !!t.socketId;
  });
}

function pickQuestion(difficulty) {
  const bucket = byDifficulty[difficulty] || [];
  const pool = bucket.filter(q => !state.usedQuestionIds.has(q.id));
  if (pool.length === 0) return null;
  const q = pool[Math.floor(Math.random() * pool.length)];
  state.usedQuestionIds.add(q.id);
  return q;
}

function clearTimer() {
  if (state.timerInterval) { clearInterval(state.timerInterval); state.timerInterval = null; }
  state.timerRemaining = 0;
  state.timerPhase = null;
}

function otherEligibleTeams() {
  // Teams in the current match, not the buzz winner, not already tried.
  const ids = matchTeamIds();
  return ids
    .filter(id => id !== state.buzzWinner && !state.triedTeamIds.includes(id))
    .map(id => findTeam(id))
    .filter(Boolean);
}

function emitAnswerOptions() {
  // After a timeout, tell the presenter which teams are still eligible to be given an answer window.
  const options = otherEligibleTeams().map(t => ({ teamId: t.id, teamName: t.name, color: t.color }));
  emitToPresenters('answer:available', { options });
}

function startTimer({ phase, seconds }) {
  clearTimer();
  state.timerPhase = phase;
  state.timerRemaining = seconds;
  io.emit('timer:tick', { remaining: state.timerRemaining, phase });
  const startedAt = Date.now();
  const totalMs = seconds * 1000;
  state.timerInterval = setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, Math.ceil((totalMs - elapsed) / 1000));
    state.timerRemaining = remaining;
    io.emit('timer:tick', { remaining, phase });
    if (remaining <= 0) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
      io.emit('timer:end', { phase });
      if (phase === 1) {
        state.status = 'timeout1';
        // The team that just used their 5s is the buzz winner
        if (state.buzzWinner && !state.triedTeamIds.includes(state.buzzWinner)) {
          state.triedTeamIds.push(state.buzzWinner);
        }
      } else {
        state.status = 'timeout2';
      }
      emitAnswerOptions();
      broadcastStateLite();
    }
  }, TICK_MS);
}

function emitToPresenters(event, payload) {
  for (const [, s] of io.sockets.sockets) {
    if (s.data.role === 'presenter') s.emit(event, payload);
  }
}

function broadcastStateLite() {
  io.emit('state:lite', {
    status: state.status,
    buzzWinner: state.buzzWinner,
    timerRemaining: state.timerRemaining,
    timerPhase: state.timerPhase,
    matchTeamIds: matchTeamIds(),
    bothMatchTeamsConnected: bothMatchTeamsConnected(),
  });
}

function fullPresenterSnapshot() {
  return {
    status: state.status,
    roster: rosterPayload(),
    match: matchPayload(),
    bothMatchTeamsConnected: bothMatchTeamsConnected(),
    currentQuestion: state.currentQuestion,
    buzzWinner: state.buzzWinner,
    buzzWinnerInfo: state.buzzWinner
      ? (() => { const t = findTeam(state.buzzWinner); return t ? { teamId: t.id, teamName: t.name, color: t.color } : null; })()
      : null,
    answerOptions: (['timeout1', 'timeout2'].includes(state.status))
      ? otherEligibleTeams().map(t => ({ teamId: t.id, teamName: t.name, color: t.color }))
      : [],
    timerRemaining: state.timerRemaining,
    timerPhase: state.timerPhase,
    poolCounts: {
      'سهل': byDifficulty['سهل'].filter(q => !state.usedQuestionIds.has(q.id)).length,
      'متوسط': byDifficulty['متوسط'].filter(q => !state.usedQuestionIds.has(q.id)).length,
      'صعب': byDifficulty['صعب'].filter(q => !state.usedQuestionIds.has(q.id)).length,
    },
    limits: { min: MIN_TEAMS, max: MAX_TEAMS },
  };
}

// ---- Routes ------------------------------------------------------------------

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'team.html')));
app.get('/team', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'team.html')));
app.get(['/host', '/mo', '/mqdm'], (_req, res) => res.sendFile(path.join(__dirname, 'public', 'setup.html')));
app.get('/setup', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'setup.html')));
app.get('/presenter', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'presenter.html')));
app.get('/questions', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'questions.html')));

app.get('/api/questions', (_req, res) => {
  res.json({
    total: questions.length,
    counts: {
      'سهل': byDifficulty['سهل'].length,
      'متوسط': byDifficulty['متوسط'].length,
      'صعب': byDifficulty['صعب'].length,
    },
    questions,
  });
});

app.get('/lan-ip', (_req, res) => res.json({ ip: getLanIp(), port: PORT }));
app.get('/qr', async (_req, res) => {
  const url = `http://${getLanIp()}:${PORT}/team`;
  try {
    const png = await QRCode.toBuffer(url, { width: 512, margin: 1, errorCorrectionLevel: 'M' });
    res.type('png').send(png);
  } catch (e) {
    res.status(500).send('QR generation failed');
  }
});
app.get('/config', (_req, res) => res.json({ minTeams: MIN_TEAMS, maxTeams: MAX_TEAMS, palette: DEFAULT_PALETTE }));

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ---- Helpers to end a question ------------------------------------------------
function clearQuestion() {
  clearTimer();
  state.currentQuestion = null;
  state.buzzWinner = null;
  state.triedTeamIds = [];
  state.status = state.currentMatch ? 'waiting' : 'noMatch';
  io.emit('question:cleared', {});
  broadcastStateLite();
}

function endMatch() {
  clearTimer();
  state.currentQuestion = null;
  state.buzzWinner = null;
  state.triedTeamIds = [];
  state.currentMatch = null;
  state.status = 'noMatch';
  io.emit('match:ended', {});
  emitToPresenters('roster:update', { roster: rosterPayload(), match: null });
  io.emit('teams:update', { roster: rosterPayload(), match: null });
  broadcastStateLite();
}

// ---- Socket handlers ---------------------------------------------------------
io.on('connection', (socket) => {
  socket.emit('teams:update', { roster: rosterPayload(), match: matchPayload() });

  socket.on('presenter:register', () => {
    socket.data.role = 'presenter';
    socket.emit('state:sync', fullPresenterSnapshot());
  });

  // ---- Setup roster --------------------------------------------------------
  socket.on('presenter:setup', (payload) => {
    if (!payload || !Array.isArray(payload.teams)) return;
    const raw = payload.teams
      .filter(t => t && typeof t.name === 'string' && t.name.trim())
      .slice(0, MAX_TEAMS)
      .map((t, i) => ({
        id: i + 1,
        name: t.name.trim().slice(0, 40),
        color: (typeof t.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(t.color))
          ? t.color
          : DEFAULT_PALETTE[i % DEFAULT_PALETTE.length],
        socketId: null,
      }));
    if (raw.length < MIN_TEAMS) return;
    state.teams = raw;
    state.currentMatch = null;
    state.currentQuestion = null;
    state.buzzWinner = null;
    state.triedTeamIds = [];
    state.status = 'noMatch';
    clearTimer();
    io.emit('session:reset', {}); // teams back to team-selection
    io.emit('teams:update', { roster: rosterPayload(), match: null });
    broadcastStateLite();
  });

  // ---- Team device claims a slot -------------------------------------------
  socket.on('team:join', ({ teamId } = {}) => {
    const team = findTeam(teamId);
    if (!team) return;
    if (team.socketId && team.socketId !== socket.id) {
      socket.emit('team:joinRejected', { teamId, reason: 'taken' });
      return;
    }
    // Release any other team this socket may already own
    for (const t of state.teams) {
      if (t.socketId === socket.id && t.id !== teamId) t.socketId = null;
    }
    team.socketId = socket.id;
    socket.data.teamId = team.id;
    io.emit('teams:update', { roster: rosterPayload(), match: matchPayload() });
    socket.emit('team:joined', { teamId: team.id, team: { id: team.id, name: team.name, color: team.color } });
    broadcastStateLite();
  });

  // ---- Presenter picks the two teams for this match ------------------------
  socket.on('presenter:startMatch', ({ teamAId, teamBId } = {}) => {
    if (state.teams.length < MIN_TEAMS) return;
    const a = findTeam(teamAId);
    const b = findTeam(teamBId);
    if (!a || !b) return;
    if (a.id === b.id) return;
    // Don't start a match if a question is currently in play
    if (['questionActive', 'answering1', 'answering2', 'timeout1', 'timeout2'].includes(state.status)) return;
    state.currentMatch = { teamAId: a.id, teamBId: b.id };
    state.currentQuestion = null;
    state.buzzWinner = null;
    state.triedTeamIds = [];
    state.status = 'waiting';
    clearTimer();
    io.emit('teams:update', { roster: rosterPayload(), match: matchPayload() });
    io.emit('match:started', { match: matchPayload() });
    broadcastStateLite();
  });

  socket.on('presenter:endMatch', () => {
    endMatch();
  });

  // ---- Pick difficulty -----------------------------------------------------
  socket.on('presenter:pickDifficulty', ({ difficulty } = {}) => {
    if (!['سهل', 'متوسط', 'صعب'].includes(difficulty)) return;
    if (state.status !== 'waiting') return;
    if (!bothMatchTeamsConnected()) return;

    const q = pickQuestion(difficulty);
    if (!q) { socket.emit('pool:empty', { difficulty }); return; }
    state.currentQuestion = q;
    state.buzzWinner = null;
    state.triedTeamIds = [];
    state.status = 'questionActive';
    clearTimer();

    const matchIds = matchTeamIds();
    for (const [, s] of io.sockets.sockets) {
      if (s.data.role === 'presenter') {
        s.emit('question:showPresenter', q);
      } else if (s.data.teamId && matchIds.includes(s.data.teamId)) {
        // Only the two match teams get the arm signal
        s.emit('question:showTeams', {});
      }
      // spectator team phones (registered but not in this match) get nothing
    }
    broadcastStateLite();
  });

  // ---- Buzz race -----------------------------------------------------------
  socket.on('team:buzz', () => {
    if (state.buzzWinner !== null) return;
    if (state.status !== 'questionActive') return;
    const teamId = socket.data.teamId;
    if (!teamId) return;
    if (!isInCurrentMatch(teamId)) return;

    state.buzzWinner = teamId;
    state.status = 'answering1';
    const winner = findTeam(teamId);
    io.emit('buzz:winner', { teamId, teamName: winner.name, color: winner.color });
    startTimer({ phase: 1, seconds: PHASE1_SECONDS });
    broadcastStateLite();
  });

  // ---- Presenter opens an answer window for a specific team ---------------
  socket.on('presenter:startAnswerTimer', ({ teamId } = {}) => {
    // valid only after a timeout, and the team must still be eligible
    if (!['timeout1', 'timeout2'].includes(state.status)) return;
    if (!teamId || !isInCurrentMatch(teamId)) return;
    if (state.triedTeamIds.includes(teamId)) return;
    // Mark as tried so the button disappears for this team next timeout
    state.triedTeamIds.push(teamId);
    state.status = 'answering2';
    // Announce this team so team phones can highlight the current answerer
    const t = findTeam(teamId);
    if (t) io.emit('answer:startingFor', { teamId: t.id, teamName: t.name, color: t.color });
    startTimer({ phase: 2, seconds: PHASE2_SECONDS });
    broadcastStateLite();
  });

  // ---- Next question -------------------------------------------------------
  socket.on('presenter:nextQuestion', () => {
    if (!['questionActive', 'answering1', 'timeout1', 'answering2', 'timeout2'].includes(state.status)) return;
    clearQuestion();
  });

  // ---- Reset whole session -------------------------------------------------
  socket.on('presenter:resetSession', () => {
    clearTimer();
    state.usedQuestionIds = new Set();
    state.currentQuestion = null;
    state.buzzWinner = null;
    state.triedTeamIds = [];
    state.currentMatch = null;
    state.teams = [];
    state.status = 'setup';
    io.emit('session:reset', {});
    io.emit('teams:update', { roster: rosterPayload(), match: null });
    broadcastStateLite();
  });

  // ---- Disconnect ---------------------------------------------------------
  socket.on('disconnect', () => {
    let touched = false;
    for (const t of state.teams) {
      if (t.socketId === socket.id) { t.socketId = null; touched = true; }
    }
    if (touched) {
      io.emit('teams:update', { roster: rosterPayload(), match: matchPayload() });
      broadcastStateLite();
    }
  });
});

// ---- Boot --------------------------------------------------------------------
httpServer.listen(PORT, '0.0.0.0', () => {
  const ip = getLanIp();
  console.log('Cell Buzzer running:');
  console.log(`  Presenter (private) : http://localhost:${PORT}/host`);
  console.log(`                        http://${ip}:${PORT}/host`);
  console.log(`  Teams (share)       : http://${ip}:${PORT}/team`);
  console.log(`  Loaded ${questions.length} questions.`);
});
