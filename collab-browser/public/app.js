/* ============================================================
   CollabBrowser — Client App
   Features: WebRTC video chat, 1080p60 screen share, text chat,
             shared URL browsing (synced iframe)
   ============================================================ */

const socket = io();

// ── State ─────────────────────────────────────────────────────
let myName = '';
let myRoomId = '';
let peerId = null;
let peerName = '';
let localStream = null;
let screenStream = null;
let isSharingScreen = false;
let micEnabled = true;
let camEnabled = true;

let videoPc = null;
let screenPc = null;

// ── ICE / TURN servers ────────────────────────────────────────
// STUN = discover your IP. TURN = relay traffic when direct fails (needed across internet)
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // Free TURN relay — critical for friends on different networks/ISPs
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};

// ── DOM refs ──────────────────────────────────────────────────
const lobby            = document.getElementById('lobby');
const app              = document.getElementById('app');
const localVideo       = document.getElementById('localVideo');
const remoteVideo      = document.getElementById('remoteVideo');
const remotePlaceholder= document.getElementById('remotePlaceholder');
const remoteVideoLabel = document.getElementById('remoteVideoLabel');
const remoteVideoName  = document.getElementById('remoteVideoName');
const messagesEl       = document.getElementById('messages');
const chatInput        = document.getElementById('chatInput');
const urlInput         = document.getElementById('urlInput');
const browserIframe    = document.getElementById('browserIframe');
const waitingOverlay   = document.getElementById('waitingOverlay');
const screenshareOverlay = document.getElementById('screenshareOverlay');
const remoteScreenVideo  = document.getElementById('remoteScreenVideo');
const screenshareBanner  = document.getElementById('screenshareBanner');
const peerDot          = document.getElementById('peerDot');
const peerNameEl       = document.getElementById('peerName');

// ── Helpers ───────────────────────────────────────────────────
function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function genRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function switchTab(tab, el) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  el.classList.add('active');
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function appendMessage({ sender, senderId, text, time, system }) {
  const mine = senderId === socket.id;
  const el = document.createElement('div');
  if (system) {
    el.className = 'system-msg';
    el.textContent = text;
  } else {
    el.className = `msg ${mine ? 'mine' : 'theirs'}`;
    el.innerHTML = `
      <div class="msg-sender">${escHtml(sender)}</div>
      <div class="msg-bubble">${escHtml(text)}</div>
      <div class="msg-time">${formatTime(time)}</div>`;
  }
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function setPeerConnected(name) {
  peerDot.classList.add('connected');
  peerNameEl.textContent = name + ' is here';
  document.getElementById('infoPeerName').textContent = name;
  document.getElementById('infoStatus').textContent   = '🟢 Connected';
  waitingOverlay.classList.add('hidden');
}

function setPeerDisconnected() {
  peerDot.classList.remove('connected');
  peerNameEl.textContent = 'Waiting for peer...';
  document.getElementById('infoPeerName').textContent = '--';
  document.getElementById('infoStatus').textContent   = '⏳ Waiting';
  remotePlaceholder.style.display = 'flex';
  remoteVideo.style.display       = 'none';
  remoteVideoLabel.style.display  = 'none';
  remoteVideoName.textContent     = 'Waiting...';
  screenshareOverlay.classList.remove('active');
  screenshareBanner.classList.remove('show');
  waitingOverlay.classList.remove('hidden');
  cleanupVideoPC();
  cleanupScreenPC();
}

// ── Lobby ─────────────────────────────────────────────────────
function createRoom() {
  const name = document.getElementById('nameInput').value.trim();
  if (!name) { showToast('Please enter your name'); return; }
  const code = genRoomCode();
  document.getElementById('newRoomCode').textContent = code;
  document.getElementById('newRoomBadge').style.display = 'block';
  document.getElementById('roomInput').value = code;
  myName    = name;
  myRoomId  = code;
  enterApp(code, name);
}

function joinRoom() {
  const name = document.getElementById('nameInput').value.trim();
  const code = document.getElementById('roomInput').value.trim().toUpperCase();
  if (!name)         { showToast('Please enter your name'); return; }
  if (code.length < 4) { showToast('Enter a valid room code'); return; }
  myName   = name;
  myRoomId = code;
  enterApp(code, name);
}

function enterApp(roomId, name) {
  lobby.style.display = 'none';
  app.style.display   = 'flex';

  document.getElementById('topRoomCode').textContent    = roomId;
  document.getElementById('infoRoomCode').textContent   = roomId;
  document.getElementById('infoMyName').textContent     = name;
  document.getElementById('infoBigCode').textContent    = roomId;
  document.getElementById('localVideoLabel').textContent = name + ' (You)';
  document.getElementById('waitingCode').textContent    = `Room Code: ${roomId}`;

  startMedia();
  socket.emit('join-room', { roomId, name });
}

// ── Media ─────────────────────────────────────────────────────
async function startMedia() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: { echoCancellation: true, noiseSuppression: true }
    });
    localVideo.srcObject = localStream;
    document.getElementById('infoVideo').textContent = '720p';
  } catch (e) {
    console.warn('Camera/mic not available:', e);
    showToast('⚠️ Camera/mic not accessible — video disabled');
  }
}

// ── Screen Share 1080p 60fps ───────────────────────────────────
async function toggleScreenShare() {
  if (!isSharingScreen) await startScreenShare();
  else stopScreenShare();
}

async function startScreenShare() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width:     { ideal: 1920, max: 1920 },
        height:    { ideal: 1080, max: 1080 },
        frameRate: { ideal: 60,   max: 60   },
        cursor: 'always'
      },
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        sampleRate: 48000
      }
    });

    isSharingScreen = true;
    document.getElementById('screenBtn').classList.add('active');
    document.getElementById('infoScreen').textContent = '1080p 60fps';
    screenshareBanner.textContent = '📺 You are sharing your screen';
    screenshareBanner.classList.add('show');
    socket.emit('screenshare-started');

    if (peerId) initScreenSharePC(peerId, true);
    screenStream.getVideoTracks()[0].addEventListener('ended', stopScreenShare);
    showToast('✅ Screen sharing at 1080p 60fps');
  } catch (e) {
    if (e.name !== 'NotAllowedError') showToast('❌ Could not start screen share');
  }
}

function stopScreenShare() {
  screenStream?.getTracks().forEach(t => t.stop());
  screenStream       = null;
  isSharingScreen    = false;
  document.getElementById('screenBtn').classList.remove('active');
  document.getElementById('infoScreen').textContent = 'Off';
  screenshareBanner.classList.remove('show');
  socket.emit('screenshare-stopped');
  cleanupScreenPC();
  showToast('Screen sharing stopped');
}

// ── Video controls ────────────────────────────────────────────
function toggleMic() {
  if (!localStream) return;
  micEnabled = !micEnabled;
  localStream.getAudioTracks().forEach(t => t.enabled = micEnabled);
  document.getElementById('micBtn').textContent = micEnabled ? '🎙️' : '🔇';
  document.getElementById('micBtn').classList.toggle('active', !micEnabled);
  showToast(micEnabled ? '🎙️ Mic on' : '🔇 Mic muted');
}

function toggleCam() {
  if (!localStream) return;
  camEnabled = !camEnabled;
  localStream.getVideoTracks().forEach(t => t.enabled = camEnabled);
  document.getElementById('camBtn').textContent = camEnabled ? '📷' : '📵';
  document.getElementById('camBtn').classList.toggle('active', !camEnabled);
  showToast(camEnabled ? '📷 Camera on' : '📵 Camera off');
}

async function togglePiP() {
  if (!remoteVideo.srcObject) { showToast('No remote video yet'); return; }
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await remoteVideo.requestPictureInPicture();
  } catch { showToast('PiP not supported in this browser'); }
}

function fullscreenVideo() {
  const v = remoteVideo.srcObject ? remoteVideo : localVideo;
  v.requestFullscreen?.();
}

// ── WebRTC: Video ─────────────────────────────────────────────
async function initVideoPC(targetId, isInitiator) {
  cleanupVideoPC();
  videoPc = new RTCPeerConnection(ICE_SERVERS);

  localStream?.getTracks().forEach(t => videoPc.addTrack(t, localStream));

  videoPc.ontrack = ({ streams: [stream] }) => {
    remoteVideo.srcObject         = stream;
    remoteVideo.style.display     = 'block';
    remotePlaceholder.style.display = 'none';
    remoteVideoLabel.style.display  = 'block';
    remoteVideoLabel.textContent    = peerName;
    remoteVideoName.textContent     = peerName;
  };

  videoPc.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit('webrtc-ice', { to: targetId, candidate });
  };

  videoPc.onconnectionstatechange = () => {
    const s = videoPc?.connectionState;
    if (s === 'connected') showToast('📹 Video connected!');
    if (s === 'failed')    showToast('❌ Video connection failed — retrying…');
  };

  if (isInitiator) {
    const offer = await videoPc.createOffer();
    await videoPc.setLocalDescription(offer);
    socket.emit('webrtc-offer', { to: targetId, offer, type: 'video' });
  }
}

function cleanupVideoPC() { videoPc?.close(); videoPc = null; }

// ── WebRTC: Screen ────────────────────────────────────────────
async function initScreenSharePC(targetId, isInitiator) {
  cleanupScreenPC();
  screenPc = new RTCPeerConnection(ICE_SERVERS);

  screenStream?.getTracks().forEach(t => screenPc.addTrack(t, screenStream));

  screenPc.ontrack = ({ streams: [stream] }) => {
    remoteScreenVideo.srcObject = stream;
    screenshareOverlay.classList.add('active');
    screenshareBanner.textContent = `📺 ${peerName} is sharing their screen`;
    screenshareBanner.classList.add('show');
    document.getElementById('infoScreen').textContent = 'Receiving 1080p 60fps';
  };

  screenPc.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit('webrtc-ice', { to: targetId, candidate });
  };

  if (isInitiator) {
    const offer = await screenPc.createOffer();
    await screenPc.setLocalDescription(offer);
    socket.emit('webrtc-offer', { to: targetId, offer, type: 'screen' });
  }
}

function cleanupScreenPC() { screenPc?.close(); screenPc = null; }

// ── Shared URL ────────────────────────────────────────────────
function navigateTo() {
  let url = urlInput.value.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  urlInput.value = url;
  browserIframe.src = url;
  socket.emit('navigate', { url });
  syncFlash();
}

function syncFlash() {
  const el = document.getElementById('syncIndicator');
  el.classList.add('active');
  el.textContent = '✅ Synced';
  setTimeout(() => { el.classList.remove('active'); el.textContent = '🔄 Synced'; }, 2000);
}

urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') navigateTo(); });

// ── Chat ──────────────────────────────────────────────────────
function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit('chat-message', { text });
  chatInput.value = '';
  chatInput.style.height = 'auto';
}

function chatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

chatInput.addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 100) + 'px';
});

// ── Invite / Leave ────────────────────────────────────────────
function copyInvite() {
  navigator.clipboard.writeText(myRoomId).then(() => showToast('📋 Room code copied!'));
}

function leaveRoom() {
  document.getElementById('leaveModal').classList.add('show');
}

function confirmLeave() { socket.disconnect(); location.reload(); }
function closeModal()   { document.getElementById('leaveModal').classList.remove('show'); }

// ── Socket.io Events ──────────────────────────────────────────
socket.on('room-full', () => {
  showToast('❌ Room is full (max 2 people)');
  lobby.style.display = 'flex';
  app.style.display   = 'none';
});

socket.on('room-joined', ({ roomId, name, sharedUrl, messages, peers }) => {
  messages.forEach(m => appendMessage(m));
  if (sharedUrl) { urlInput.value = sharedUrl; browserIframe.src = sharedUrl; }

  if (peers.length > 0) {
    const p = peers[0];
    peerId   = p.socketId;
    peerName = p.name;
    setPeerConnected(p.name);
    appendMessage({ system: true, text: `You joined. ${p.name} is already here.` });
    initVideoPC(peerId, false);
  } else {
    appendMessage({ system: true, text: `Room created! Share code ${roomId} with your friend.` });
  }
});

socket.on('peer-joined', ({ name, socketId }) => {
  peerId   = socketId;
  peerName = name;
  setPeerConnected(name);
  appendMessage({ system: true, text: `${name} joined the room 🎉` });
  initVideoPC(socketId, true);
  if (isSharingScreen && screenStream) initScreenSharePC(socketId, true);
});

socket.on('peer-left', ({ name }) => {
  appendMessage({ system: true, text: `${name} left the room` });
  setPeerDisconnected();
  peerId = null; peerName = '';
});

socket.on('chat-message', msg => {
  appendMessage(msg);
  if (!document.getElementById('tab-chat').classList.contains('active')) {
    const btn = document.querySelector('.chat-tab');
    btn.style.color = 'var(--yellow)';
    setTimeout(() => btn.style.color = '', 2000);
  }
});

socket.on('navigate', ({ url, by }) => {
  urlInput.value    = url;
  browserIframe.src = url;
  syncFlash();
  appendMessage({ system: true, text: `${by} navigated to ${url}` });
});

socket.on('screenshare-started', () => {
  appendMessage({ system: true, text: `${peerName} started screen sharing` });
});

socket.on('screenshare-stopped', () => {
  screenshareOverlay.classList.remove('active');
  screenshareBanner.classList.remove('show');
  remoteScreenVideo.srcObject = null;
  document.getElementById('infoScreen').textContent = 'Off';
  appendMessage({ system: true, text: `${peerName} stopped screen sharing` });
  cleanupScreenPC();
});

// ── WebRTC Signaling ──────────────────────────────────────────
socket.on('webrtc-offer', async ({ from, offer, type }) => {
  if (type === 'video') {
    await initVideoPC(from, false);
    await videoPc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await videoPc.createAnswer();
    await videoPc.setLocalDescription(answer);
    socket.emit('webrtc-answer', { to: from, answer, type: 'video' });
  } else if (type === 'screen') {
    await initScreenSharePC(from, false);
    await screenPc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await screenPc.createAnswer();
    await screenPc.setLocalDescription(answer);
    socket.emit('webrtc-answer', { to: from, answer, type: 'screen' });
  }
});

socket.on('webrtc-answer', async ({ answer, type }) => {
  try {
    if (type === 'video'  && videoPc)  await videoPc.setRemoteDescription(new RTCSessionDescription(answer));
    if (type === 'screen' && screenPc) await screenPc.setRemoteDescription(new RTCSessionDescription(answer));
  } catch(e) { console.error('setRemoteDescription failed:', e); }
});

socket.on('webrtc-ice', async ({ candidate }) => {
  const c = new RTCIceCandidate(candidate);
  try { if (videoPc?.remoteDescription)  await videoPc.addIceCandidate(c); } catch{}
  try { if (screenPc?.remoteDescription) await screenPc.addIceCandidate(c); } catch{}
});

// ── Stats ─────────────────────────────────────────────────────
setInterval(async () => {
  if (!videoPc) return;
  try {
    const stats = await videoPc.getStats();
    stats.forEach(r => {
      if (r.type === 'inbound-rtp' && r.kind === 'video' && r.frameWidth) {
        document.getElementById('infoVideo').textContent =
          `${r.frameWidth}×${r.frameHeight} ${Math.round(r.framesPerSecond||0)}fps`;
      }
    });
  } catch {}
}, 3000);
