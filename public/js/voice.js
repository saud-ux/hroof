// Voice chat over WebRTC ------------------------------------------------------
// Audio goes straight between devices; the server only relays the handshake.
// To keep phones light we do NOT build a full mesh: a peer connects to another
// peer only when at least one of the two is allowed to speak. With the default
// "winner" mode that means every phone holds at most two connections — the
// presenter, and whoever buzzed first.

window.createVoice = function createVoice({ socket, isHost, onRoom, onStatus, onLevel }) {
  const ICE = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  // Browsers default Opus to roughly phone quality (~24-32 kbps). Voice stays
  // mono, so we can afford far more than that — but a speaker sends a separate
  // copy to every listener, so the rate has to come down as the room grows or a
  // phone's uplink is the thing that breaks. The budget is the total a single
  // speaker uploads; the per-connection rate is that split between listeners.
  const UPLOAD_BUDGET = 300000;
  const MAX_BITRATE = 96000;   // 1-3 listeners: transparent for speech
  const MIN_BITRATE = 32000;   // large rooms: still clearly better than default

  function bitrateFor(listeners) {
    const n = Math.max(1, listeners);
    return Math.max(MIN_BITRATE, Math.min(MAX_BITRATE, Math.round(UPLOAD_BUDGET / n)));
  }

  // The SDP is negotiated once per peer, so it advertises the ceiling; the live
  // rate is what setParameters enforces below as the room changes size.
  const TARGET_BITRATE = MAX_BITRATE;

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
        // A muted mic detaches its track entirely (see applyMic), so nothing is
        // sent while silent and DTX has nothing left to save. Turning it off
        // avoids the clipped first syllable it causes when speech resumes.
        'usedtx=0',
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

  // The fmtp line is a hint; this sets the actual send bitrate, and is re-applied
  // whenever the number of people we send to changes.
  async function applyBitrate() {
    const rate = bitrateFor(peers.size);
    for (const entry of peers.values()) {
      const sender = entry.sender;
      if (!sender) continue;
      try {
        const params = sender.getParameters();
        if (!params.encodings || !params.encodings.length) params.encodings = [{}];
        if (params.encodings[0].maxBitrate === rate) continue;
        params.encodings[0].maxBitrate = rate;
        params.encodings[0].priority = 'high';
        await sender.setParameters(params);
      } catch (_) { /* unsupported on some browsers; the fmtp hint still applies */ }
    }
  }

  const peers = new Map();   // peerId -> { pc, audio }
  let localStream = null;
  let selfId = null;
  let room = { members: [], mode: 'winner', speakers: [] };
  let joined = false;
  let levelCtx = null;
  let levelTimer = null;

  const amSpeaker = () => room.speakers.includes(selfId);
  const isSpeaker = (id) => room.speakers.includes(id);

  function status(text, state) {
    if (onStatus) onStatus(text, state);
  }

  // Muting detaches the track from every sender rather than muting it in place.
  // A disabled track still streams silence; a detached one sends nothing at all,
  // which is both honest about privacy and frees the uplink completely.
  function applyMic() {
    if (!localStream) return;
    const on = amSpeaker();
    const track = localStream.getAudioTracks()[0] || null;
    if (track) track.enabled = on;

    for (const entry of peers.values()) {
      if (!entry.sender) continue;
      const wanted = on ? track : null;
      if (entry.sender.track === wanted) continue;
      try {
        const p = entry.sender.replaceTrack(wanted);
        if (p && p.catch) p.catch(() => {});
      } catch (_) { /* older browsers fall back to the enabled flag above */ }
    }
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
    const entry = { pc, audio: attachAudio(id), sender: null };
    peers.set(id, entry);

    if (localStream) {
      const track = localStream.getAudioTracks()[0];
      // Always add the track so the audio line is negotiated, then let applyMic
      // detach it again if this peer is not allowed to speak yet.
      if (track) entry.sender = pc.addTrack(track, localStream);
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
          await applyBitrate();
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
    applyBitrate(); // the room just changed size, so the split changed too
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
          await applyBitrate();
          socket.emit('voice:signal', { to: from, data: { description: pc.localDescription } });
        }
      } else if (data.candidate) {
        await pc.addIceCandidate(data.candidate);
      }
    } catch (_) { /* a stale candidate before the description is safe to drop */ }
  });

  // A small running level so someone can see their mic is picking up at all,
  // instead of guessing why nobody hears them.
  function startLevelMeter() {
    if (!onLevel || !localStream) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const src = ctx.createMediaStreamSource(localStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      levelCtx = ctx;
      const tick = () => {
        if (!joined) { try { ctx.close(); } catch (_) {} return; }
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
        onLevel(amSpeaker() ? Math.min(1, peak / 60) : 0);
        levelTimer = requestAnimationFrame(tick);
      };
      tick();
    } catch (_) { /* the meter is a nicety, never a blocker */ }
  }

  function stopLevelMeter() {
    if (levelTimer) cancelAnimationFrame(levelTimer);
    levelTimer = null;
    if (levelCtx) { try { levelCtx.close(); } catch (_) {} levelCtx = null; }
    if (onLevel) onLevel(0);
  }

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
      startLevelMeter();
      socket.emit('voice:join');
      status(isHost ? 'مايكك مفتوح' : 'مايكك مكتوم', isHost ? 'live' : 'muted');
      return true;
    },

    leave() {
      if (!joined) return;
      joined = false;
      stopLevelMeter();
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
