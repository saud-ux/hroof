// Standalone buzzer room ------------------------------------------------------
// Completely independent from the Cell game: its own socket.io namespace,
// its own state. People open /buzz, type a name, and race to press.
// The first press wins the round and locks everybody else out.

const MAX_PLAYERS = 200;
const MAX_NAME = 24;

function createRoom() {
  return {
    round: 1,
    armed: false,     // presses are accepted
    armedAt: 0,       // ms timestamp the round opened
    players: [],      // [{ id, name }]  id === socket.id
    presses: [],      // [{ id, name, ms }] ordered by arrival; presses[0] is the winner
  };
}

function attachSoloBuzzer(io) {
  const room = createRoom();
  const nsp = io.of('/solo');

  const findPlayer = (id) => room.players.find(p => p.id === id);
  const winner = () => room.presses[0] || null;

  function snapshot() {
    return {
      round: room.round,
      armed: room.armed,
      players: room.players.map(p => ({ id: p.id, name: p.name })),
      presses: room.presses.map(p => ({ id: p.id, name: p.name, ms: p.ms })),
      winner: winner(),
    };
  }

  function broadcast() {
    nsp.emit('solo:state', snapshot());
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
    socket.emit('solo:state', snapshot());

    // ---- Player ------------------------------------------------------------
    socket.on('solo:join', ({ name } = {}) => {
      const clean = cleanName(name);
      if (!clean) { socket.emit('solo:joinRejected', { reason: 'اكتب اسمك أولاً' }); return; }
      if (room.players.length >= MAX_PLAYERS && !findPlayer(socket.id)) {
        socket.emit('solo:joinRejected', { reason: 'العدد اكتمل' });
        return;
      }
      const finalName = uniqueName(clean, socket.id);
      const existing = findPlayer(socket.id);
      if (existing) existing.name = finalName;
      else room.players.push({ id: socket.id, name: finalName });
      socket.data.soloPlayer = true;
      socket.emit('solo:joined', { id: socket.id, name: finalName });
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
        ms: Math.max(0, Date.now() - room.armedAt),
      });
      broadcast();
    });

    // ---- Host --------------------------------------------------------------
    socket.on('solo:hostRegister', () => {
      socket.data.soloHost = true;
      socket.emit('solo:state', snapshot());
    });

    socket.on('solo:arm', () => {
      if (!socket.data.soloHost) return;
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
      nsp.emit('solo:cleared', {});
      broadcast();
    });

    socket.on('disconnect', () => {
      const before = room.players.length;
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length !== before) broadcast();
    });
  });

  return nsp;
}

module.exports = { attachSoloBuzzer };
