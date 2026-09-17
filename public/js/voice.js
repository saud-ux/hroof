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

  // Browsers default Opus to roughly phone quality (~24-32 kbps). Voice stays
  // mono, so 64 kbps is plenty of headroom for clearly better speech without
  // straining a phone's uplink.
  const TARGET_BITRATE = 64000;

  // Rewrite the Opus parameters the browser advertises. In-band FEC is the big
  // one on mobile: it rebuilds short dropouts instead of leaving a gap. DTX
  // stays on so a muted mic costs almost nothing.
  function tuneOpus(sdp) {
    try {
      const payload = (sdp.match(/a=rtpmap:(\d+) opus\/48000/i) || [])[1];
      if (!payload) return sdp;

      const wanted = [
        'stereo=0',
        'sprop-stereo=0',
        `maxaveragebitrate=${TARGET_BITRATE}`,
        'maxplaybackrate=48000',
        'useinbandfec=1',
        'usedtx=1',
      ];

      const fmtpLine = new RegExp(`a=fmtp:${payload} (.*)`);
      if (fmtpLine.test(sdp)) {
        return sdp.replace(fmtpLine, (_m, existing) => {
          const keep = existing
            .split(';')
            .map(x => x.trim())
            .filter(x => x && !wanted.some(w => x.startsWith(w.split('=')[0] + '=')));
          return `a=fmtp:${payload} ${keep.concat(wanted).join(';')}`;
        });
      }
      return sdp.replace(
        new RegExp(`(a=rtpmap:${payload} opus/48000[^\\r\\n]*)`),
        `$1\r\na=fmtp:${payload} ${wanted.join(';')}`
      );
    } catch (_) {
      return sdp; // never let tuning break the handshake
    }
  }

  // The fmtp line is a hint; this sets the actual send bitrate.
  async function raiseBitrate(pc) {
    try {
      for (const sender of pc.getSenders()) {
        if (!sender.track || sender.track.kind !== 'audio') continue;
        const params = sender.getParameters();
        if (!params.encodings || !params.encodings.length) params.encodings = [{}];
        params.encodings[0].maxBitrate = TARGET_BITRATE;
        params.encodings[0].priority = 'high';
        await sender.setParameters(params);
      }
    } catch (_) { /* unsupported on some browsers; the fmtp hint still applies */ }
  }

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
          offer.sdp = tuneOpus(offer.sdp);
          await pc.setLocalDescription(offer);
          await raiseBitrate(pc);
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
          answer.sdp = tuneOpus(answer.sdp);
          await pc.setLocalDescription(answer);
          await raiseBitrate(pc);
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
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 48000,      // capture at Opus's native rate, no resampling
            sampleSize: 16,
          },
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
