// Voice chat over WebRTC ------------------------------------------------------
// Audio goes straight between devices; the server only relays the handshake.
// To keep phones light we do NOT build a full mesh: a peer connects to another
// peer only when at least one of the two is allowed to speak. With the default
// "winner" mode that means every phone holds at most two connections — the
// presenter, and whoever buzzed first.

window.createVoice = function createVoice({ socket, isHost, onRoom, onStatus }) {
  const ICE = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  const peers = new Map();   // peerId -> { pc, audio }
  let localStream = null;
  let selfId = null;
  let room = { members: [], mode: 'winner', speakers: [] };
  let joined = false;

  const amSpeaker = () => room.speakers.includes(selfId);
  const isSpeaker = (id) => room.speakers.includes(id);

  function status(text, state) {
    if (onStatus) onStatus(text, state);
  }

  function applyMic() {
    if (!localStream) return;
    const on = amSpeaker();
    localStream.getAudioTracks().forEach(t => { t.enabled = on; });
    status(on ? 'مايكك مفتوح' : 'مايكك مكتوم', on ? 'live' : 'muted');
  }

  function attachAudio(id) {
    let el = document.getElementById(`voice-audio-${id}`);
    if (!el) {
      el = document.createElement('audio');
      el.id = `voice-audio-${id}`;
      el.autoplay = true;
      el.playsInline = true;
      document.body.appendChild(el);
    }
    return el;
  }

  function createPeer(id, initiator) {
    if (peers.has(id)) return peers.get(id);
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const entry = { pc, audio: attachAudio(id) };
    peers.set(id, entry);

    if (localStream) {
      localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('voice:signal', { to: id, data: { candidate: e.candidate } });
    };

    pc.ontrack = (e) => {
      entry.audio.srcObject = e.streams[0];
      // Autoplay can still be refused; the join tap is our user gesture.
      const p = entry.audio.play();
      if (p && p.catch) p.catch(() => {});
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        // Usually a NAT that needs a TURN relay.
        status('تعذّر الاتصال الصوتي بأحد الأطراف', 'error');
        closePeer(id);
      }
    };

    if (initiator) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('voice:signal', { to: id, data: { description: pc.localDescription } });
        } catch (_) { /* renegotiation races are retried by the next event */ }
      };
    }
    return entry;
  }

  function closePeer(id) {
    const entry = peers.get(id);
    if (!entry) return;
    try { entry.pc.close(); } catch (_) { /* already closed */ }
    if (entry.audio) entry.audio.remove();
    peers.delete(id);
  }

  // A connection is worth holding only if audio can actually flow through it.
  function wantedPeers() {
    const want = new Set();
    for (const m of room.members) {
      if (m.id === selfId) continue;
      if (isSpeaker(m.id) || amSpeaker()) want.add(m.id);
    }
    return want;
  }

  function syncPeers() {
    if (!joined) return;
    const want = wantedPeers();
    for (const id of peers.keys()) if (!want.has(id)) closePeer(id);
    for (const id of want) {
      // Both sides must agree on who offers, or they collide mid-handshake.
      if (!peers.has(id)) createPeer(id, selfId < id);
    }
    applyMic();
  }

  socket.on('voice:room', (payload) => {
    room = payload || room;
    if (onRoom) onRoom(room);
    syncPeers();
  });

  socket.on('voice:peerLeft', ({ id }) => closePeer(id));

  socket.on('voice:signal', async ({ from, data }) => {
    if (!joined || !from || !data) return;
    const entry = peers.get(from) || createPeer(from, false);
    const pc = entry.pc;
    try {
      if (data.description) {
        await pc.setRemoteDescription(data.description);
        if (data.description.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('voice:signal', { to: from, data: { description: pc.localDescription } });
        }
      } else if (data.candidate) {
        await pc.addIceCandidate(data.candidate);
      }
    } catch (_) { /* a stale candidate before the description is safe to drop */ }
  });

  return {
    async join(id) {
      selfId = id;
      if (joined) return true;
      if (!navigator.mediaDevices || !window.RTCPeerConnection) {
        status('المتصفح لا يدعم الصوت', 'error');
        return false;
      }
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
      } catch (_) {
        status('لم تسمح باستخدام المايك', 'error');
        return false;
      }
      joined = true;
      applyMic();
      socket.emit('voice:join');
      status(isHost ? 'مايكك مفتوح' : 'مايكك مكتوم', isHost ? 'live' : 'muted');
      return true;
    },

    leave() {
      if (!joined) return;
      joined = false;
      socket.emit('voice:leave');
      for (const id of [...peers.keys()]) closePeer(id);
      if (localStream) localStream.getTracks().forEach(t => t.stop());
      localStream = null;
      status('خارج الصوت', 'off');
    },

    setSelfId(id) { selfId = id; syncPeers(); },
    isJoined() { return joined; },
    room() { return room; },
  };
};
