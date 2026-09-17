// Standalone buzzer room ------------------------------------------------------
// Completely independent from the Cell game: its own socket.io namespace,
// its own state. People open /buzz, type a name, and race to press.
// The first press wins the round and locks everybody else out.

const { ARABIC_LETTERS, buildLetterIndex, letterCounts, pickFrom } = require('./questions-index');

const MAX_PLAYERS = 200;
const MAX_NAME = 24;
const MIN_TEAMS = 2;
const MAX_TEAMS = 8;
const DIFFICULTIES = ['سهل', 'متوسط', 'صعب'];

// Each participant picks a colour; their buzzer takes it, the way a team's
// colour works in the Cell game.
const PALETTE = [
  '#22c55e', '#3b82f6', '#f97316', '#a855f7',
  '#eab308', '#ec4899', '#14b8a6', '#ef4444',
];

function createRoom() {
  return {
    round: 1,
    armed: false,     // presses are accepted
    armedAt: 0,       // ms timestamp the round opened
    players: [],      // [{ id, name }]  id === socket.id
    presses: [],      // [{ id, name, ms }] ordered by arrival; presses[0] is the winner
    question: null,   // the question on screen, host-only
    usedIds: new Set(),
    teams: [],        // [{ id, name, color }] — empty means free-for-all

    voice: {
      members: new Set(),   // socket ids with an open mic connection
      granted: new Set(),   // ids the host explicitly un-muted
      mode: 'winner',       // winner | open | host
    },
  };
}

function attachSoloBuzzer(io, questions = [], byDifficulty = {}) {
  const room = createRoom();
  const nsp = io.of('/solo');
  const letterIndex = buildLetterIndex(questions);
  const hasQuestions = questions.length > 0;

  const findPlayer = (id) => room.players.find(p => p.id === id);
  const winner = () => room.presses[0] || null;

  function teamNameOf(player) {
    if (!player || player.teamId == null) return null;
    const t = room.teams.find(x => x.id === player.teamId);
    return t ? t.name : null;
  }

  // Who is allowed to transmit right now. Hosts always may; the rest depends on
  // the mode and on whoever won the current round.
  function speakerIds() {
    const out = new Set();
    for (const id of room.voice.members) {
      const s = nsp.sockets.get(id);
      if (s && s.data.soloHost) out.add(id);
    }
    if (room.voice.mode === 'open') {
      for (const id of room.voice.members) out.add(id);
    } else if (room.voice.mode === 'winner') {
      const w = winner();
      if (w && room.voice.members.has(w.id)) out.add(w.id);
    }
    for (const id of room.voice.granted) {
      if (room.voice.members.has(id)) out.add(id);
    }
    return out;
  }

  function voicePayload() {
    const speakers = speakerIds();
    const members = [];
    for (const id of room.voice.members) {
      const s = nsp.sockets.get(id);
      if (!s) continue;
      const player = findPlayer(id);
      members.push({
        id,
        name: player ? player.name : (s.data.soloHost ? 'المقدم' : 'ضيف'),
        isHost: !!s.data.soloHost,
        speaking: speakers.has(id),
      });
    }
    return { members, mode: room.voice.mode, speakers: [...speakers] };
  }

  function broadcastVoice() {
    nsp.emit('voice:room', voicePayload());
  }

  function snapshot(forHost) {
    const base = {
      round: room.round,
      armed: room.armed,
      teams: room.teams,
      players: room.players.map(p => ({
        id: p.id, name: p.name, color: p.color, teamId: p.teamId ?? null, teamName: teamNameOf(p),
      })),
      presses: room.presses.map(p => ({
        id: p.id, name: p.name, ms: p.ms, color: p.color, teamId: p.teamId ?? null, teamName: p.teamName || null,
      })),
      palette: PALETTE,
      winner: winner(),
      // players only learn THAT a question is up, never what it says
      hasQuestion: !!room.question,
    };
    if (!forHost) return base;
    return {
      ...base,
      question: room.question,
      hasBank: hasQuestions,
      letters: ARABIC_LETTERS,
      letterCounts: lettersPayload(),
      poolCounts: poolPayload(),
    };
  }

  function lettersPayload() {
    const out = {};
    for (const d of DIFFICULTIES) out[d] = letterCounts(letterIndex, d, room.usedIds);
    return out;
  }

  function poolPayload() {
    const out = {};
    for (const d of DIFFICULTIES) {
      out[d] = (byDifficulty[d] || []).filter(q => !room.usedIds.has(q.id)).length;
    }
    return out;
  }

  function broadcast() {
    const forPlayers = snapshot(false);
    for (const [, s] of nsp.sockets) {
      s.emit('solo:state', s.data.soloHost ? snapshot(true) : forPlayers);
    }
  }

  function cleanName(raw) {
    if (typeof raw !== 'string') return '';
    return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  }

  function uniqueName(name, selfId) {
    const taken = room.players.some(p => p.id !== selfId && p.name === name);
    if (!taken) return name;
    for (let i = 2; i < 100; i++) {
      const candidate = `${name} ${i}`;
      if (!room.players.some(p => p.id !== selfId && p.name === candidate)) return candidate;
    }
    return `${name} ${Math.floor(Math.random() * 999)}`;
  }

  nsp.on('connection', (socket) => {
    socket.emit('solo:state', snapshot(false));

    // ---- Player ------------------------------------------------------------
    socket.on('solo:join', ({ name, color, teamId } = {}) => {
      const clean = cleanName(name);
      if (!clean) { socket.emit('solo:joinRejected', { reason: 'اكتب اسمك أولاً' }); return; }
      if (room.players.length >= MAX_PLAYERS && !findPlayer(socket.id)) {
        socket.emit('solo:joinRejected', { reason: 'العدد اكتمل' });
        return;
      }
      // In team mode a player belongs to a team and wears its colour; otherwise
      // they pick their own.
      let team = null;
      if (room.teams.length) {
        team = room.teams.find(t => t.id === teamId);
        if (!team) { socket.emit('solo:joinRejected', { reason: 'اختر فريقك أولاً' }); return; }
      }

      const finalName = uniqueName(clean, socket.id);
      const finalColor = team
        ? team.color
        : (PALETTE.includes(color) ? color : PALETTE[room.players.length % PALETTE.length]);

      const existing = findPlayer(socket.id);
      if (existing) {
        existing.name = finalName;
        existing.color = finalColor;
        existing.teamId = team ? team.id : null;
      } else {
        room.players.push({ id: socket.id, name: finalName, color: finalColor, teamId: team ? team.id : null });
      }
      socket.data.soloPlayer = true;
      socket.emit('solo:joined', {
        id: socket.id,
        name: finalName,
        color: finalColor,
        teamId: team ? team.id : null,
        teamName: team ? team.name : null,
      });
      broadcast();
    });

    socket.on('solo:leave', () => {
      room.players = room.players.filter(p => p.id !== socket.id);
      broadcast();
    });

    socket.on('solo:press', () => {
      if (!room.armed) return;
      const player = findPlayer(socket.id);
      if (!player) return;
      if (room.presses.some(p => p.id === socket.id)) return; // one press per round
      room.presses.push({
        id: player.id,
        name: player.name,
        color: player.color,
        teamId: player.teamId ?? null,
        teamName: teamNameOf(player),
        ms: Math.max(0, Date.now() - room.armedAt),
      });
      broadcast();
      // In "winner" mode the first press hands that phone the mic.
      if (room.voice.mode === 'winner') broadcastVoice();
    });

    // ---- Host --------------------------------------------------------------
    socket.on('solo:hostRegister', () => {
      socket.data.soloHost = true;
      socket.emit('solo:state', snapshot(true));
    });

    // Pull a question from the bank and open the round with it in one step.
    socket.on('solo:pickQuestion', ({ difficulty, letter } = {}) => {
      if (!socket.data.soloHost) return;
      if (!DIFFICULTIES.includes(difficulty)) return;
      if (letter && !ARABIC_LETTERS.includes(letter)) return;

      const q = pickFrom({
        index: letterIndex,
        byDifficulty,
        difficulty,
        letter: letter || null,
        usedIds: room.usedIds,
      });
      if (!q) { socket.emit('solo:poolEmpty', { difficulty, letter: letter || null }); return; }

      room.question = q;
      room.round += 1;
      room.presses = [];
      room.armed = true;
      room.armedAt = Date.now();
      broadcast();
    });

    socket.on('solo:clearQuestion', () => {
      if (!socket.data.soloHost) return;
      room.question = null;
      room.armed = false;
      room.presses = [];
      broadcast();
      if (room.voice.mode === 'winner') broadcastVoice();
    });

    socket.on('solo:arm', () => {
      if (!socket.data.soloHost) return;
      room.question = null; // a bare round has no question attached
      room.armed = true;
      room.armedAt = Date.now();
      room.presses = [];
      broadcast();
    });

    socket.on('solo:disarm', () => {
      if (!socket.data.soloHost) return;
      room.armed = false;
      broadcast();
    });

    socket.on('solo:nextRound', () => {
      if (!socket.data.soloHost) return;
      room.round += 1;
      room.presses = [];
      room.armed = true;
      room.armedAt = Date.now();
      broadcast();
      if (room.voice.mode === 'winner') broadcastVoice();
    });

    // Switch the room into team mode. Players whose team disappears are sent
    // back to the picker rather than left in a team that no longer exists.
    socket.on('solo:setTeams', ({ teams } = {}) => {
      if (!socket.data.soloHost) return;
      if (!Array.isArray(teams)) return;

      const clean = teams
        .filter(t => t && typeof t.name === 'string' && t.name.trim())
        .slice(0, MAX_TEAMS)
        .map((t, i) => ({
          id: i + 1,
          name: t.name.trim().slice(0, MAX_NAME),
          color: PALETTE.includes(t.color) ? t.color : PALETTE[i % PALETTE.length],
        }));
      if (clean.length && clean.length < MIN_TEAMS) {
        socket.emit('solo:teamsRejected', { reason: `تحتاج ${MIN_TEAMS} فرق على الأقل` });
        return;
      }

      room.teams = clean;
      const validIds = new Set(clean.map(t => t.id));
      const dropped = [];
      for (const p of room.players) {
        if (clean.length && !validIds.has(p.teamId)) dropped.push(p.id);
        else if (clean.length) {
          const t = clean.find(x => x.id === p.teamId);
          if (t) p.color = t.color;
        }
      }
      if (dropped.length) {
        room.players = room.players.filter(p => !dropped.includes(p.id));
        room.presses = room.presses.filter(p => !dropped.includes(p.id));
        for (const id of dropped) {
          const s = nsp.sockets.get(id);
          if (s) s.emit('solo:teamsChanged', {});
        }
      }
      broadcast();
    });

    socket.on('solo:kick', ({ id } = {}) => {
      if (!socket.data.soloHost) return;
      room.players = room.players.filter(p => p.id !== id);
      room.presses = room.presses.filter(p => p.id !== id);
      const target = nsp.sockets.get(id);
      if (target) target.emit('solo:kicked', {});
      broadcast();
    });

    socket.on('solo:clearAll', () => {
      if (!socket.data.soloHost) return;
      room.players = [];
      room.presses = [];
      room.armed = false;
      room.round = 1;
      room.question = null;
      room.usedIds = new Set();
      room.teams = [];
      nsp.emit('solo:cleared', {});
      broadcast();
    });

    // ---- Voice chat (WebRTC signalling only; audio never touches the server) --
    socket.on('voice:join', () => {
      room.voice.members.add(socket.id);
      broadcastVoice();
    });

    socket.on('voice:leave', () => {
      room.voice.members.delete(socket.id);
      room.voice.granted.delete(socket.id);
      nsp.emit('voice:peerLeft', { id: socket.id });
      broadcastVoice();
    });

    // Relay an offer / answer / ICE candidate to one peer, untouched.
    socket.on('voice:signal', ({ to, data } = {}) => {
      if (typeof to !== 'string' || !data) return;
      if (!room.voice.members.has(socket.id)) return;
      const target = nsp.sockets.get(to);
      if (!target || !room.voice.members.has(to)) return;
      target.emit('voice:signal', { from: socket.id, data });
    });

    socket.on('voice:setMic', ({ id, on } = {}) => {
      if (!socket.data.soloHost) return;
      if (on) room.voice.granted.add(id);
      else room.voice.granted.delete(id);
      broadcastVoice();
    });

    socket.on('voice:setMode', ({ mode } = {}) => {
      if (!socket.data.soloHost) return;
      if (!['winner', 'open', 'host'].includes(mode)) return;
      room.voice.mode = mode;
      room.voice.granted.clear();
      broadcastVoice();
    });

    socket.on('disconnect', () => {
      if (room.voice.members.delete(socket.id)) {
        room.voice.granted.delete(socket.id);
        nsp.emit('voice:peerLeft', { id: socket.id });
        broadcastVoice();
      }
      const before = room.players.length;
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length !== before) broadcast();
    });
  });

  return nsp;
}

module.exports = { attachSoloBuzzer };
