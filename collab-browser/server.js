const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 1e8
});

app.use(express.static(path.join(__dirname, 'public')));

// rooms: { roomId: { users: Map<socketId, {name, socketId}>, messages: [], sharedUrl: '' } }
const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { users: new Map(), messages: [], sharedUrl: 'https://example.com' });
  }
  return rooms.get(roomId);
}

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);
  let currentRoom = null;
  let currentName = null;

  // --- Room Management ---
  socket.on('join-room', ({ roomId, name }) => {
    const room = getOrCreateRoom(roomId);

    if (room.users.size >= 2) {
      socket.emit('room-full');
      return;
    }

    currentRoom = roomId;
    currentName = name || `User ${Math.floor(Math.random() * 1000)}`;
    room.users.set(socket.id, { name: currentName, socketId: socket.id });
    socket.join(roomId);

    // Send room state to joiner
    socket.emit('room-joined', {
      roomId,
      name: currentName,
      sharedUrl: room.sharedUrl,
      messages: room.messages,
      peers: [...room.users.values()].filter(u => u.socketId !== socket.id)
    });

    // Notify others
    socket.to(roomId).emit('peer-joined', { name: currentName, socketId: socket.id });

    console.log(`[Room ${roomId}] ${currentName} joined (${room.users.size}/2)`);
  });

  // --- Text Chat ---
  socket.on('chat-message', ({ text }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    const msg = {
      id: crypto.randomUUID(),
      sender: currentName,
      senderId: socket.id,
      text,
      time: Date.now()
    };
    room.messages.push(msg);
    if (room.messages.length > 200) room.messages.shift();
    io.to(currentRoom).emit('chat-message', msg);
  });

  // --- Shared URL Sync ---
  socket.on('navigate', ({ url }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    room.sharedUrl = url;
    socket.to(currentRoom).emit('navigate', { url, by: currentName });
  });

  // --- WebRTC Signaling ---
  socket.on('webrtc-offer', ({ to, offer, type }) => {
    io.to(to).emit('webrtc-offer', { from: socket.id, offer, type });
  });

  socket.on('webrtc-answer', ({ to, answer, type }) => {
    io.to(to).emit('webrtc-answer', { from: socket.id, answer, type });
  });

  socket.on('webrtc-ice', ({ to, candidate }) => {
    io.to(to).emit('webrtc-ice', { from: socket.id, candidate });
  });

  // --- Screen Share Control (remote mouse/keyboard events) ---
  socket.on('remote-event', (data) => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('remote-event', data);
  });

  // --- Screenshare state notification ---
  socket.on('screenshare-started', () => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('screenshare-started', { by: socket.id });
  });
  socket.on('screenshare-stopped', () => {
    if (!currentRoom) return;
    socket.to(currentRoom).emit('screenshare-stopped');
  });

  // --- Disconnect ---
  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (room) {
      room.users.delete(socket.id);
      io.to(currentRoom).emit('peer-left', { name: currentName, socketId: socket.id });
      console.log(`[Room ${currentRoom}] ${currentName} left`);
      if (room.users.size === 0) {
        rooms.delete(currentRoom);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`\n🚀 Collab Browser running at http://localhost:${PORT}\n`));
