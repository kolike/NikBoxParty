const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = {};
const socketToRoom = {};

function generateCode() {
  let code = "";
  do {
    code = Math.random().toString(36).substring(2, 6).toUpperCase();
  } while (rooms[code]);
  return code;
}

function buildRoomState(code) {
  const room = rooms[code];
  if (!room) return null;
  return {
    code,
    hostId: room.hostId,
    players: room.players,
  };
}

function broadcastRoomState(code) {
  const state = buildRoomState(code);
  if (!state) return;
  io.to(code).emit("room-state-updated", state);
}

function removeSocketFromRoom(socketId, code) {
  const room = rooms[code];
  if (!room) return;

  room.players = room.players.filter((player) => player.id !== socketId);

  if (room.hostId === socketId) {
    room.hostId = room.players[0]?.id || null;
  }

  if (room.players.length === 0) {
    delete rooms[code];
    return;
  }

  broadcastRoomState(code);
}

app.use(express.static(path.join(__dirname, "..", "public")));
app.get("/", (req, res) => {
  res.redirect("/host.html");
});

io.on("connection", (socket) => {
  socket.on("create-room", () => {
    const previousRoomCode = socketToRoom[socket.id];
    if (previousRoomCode) {
      socket.leave(previousRoomCode);
      removeSocketFromRoom(socket.id, previousRoomCode);
      delete socketToRoom[socket.id];
    }

    const code = generateCode();
    rooms[code] = {
      hostId: socket.id,
      players: [{ id: socket.id, name: "Ведущий" }],
    };
    socketToRoom[socket.id] = code;
    socket.join(code);
    socket.emit("room-created", buildRoomState(code));
    broadcastRoomState(code);
  });

  socket.on("join-room", ({ code, name }) => {
    const normalizedCode = (code || "").trim().toUpperCase();
    const room = rooms[normalizedCode];
    if (!room) {
      socket.emit("app-error", "Комната не найдена");
      return;
    }

    const playerName = (name || "").trim();
    if (!playerName) {
      socket.emit("app-error", "Укажите имя игрока");
      return;
    }

    const previousRoomCode = socketToRoom[socket.id];
    if (previousRoomCode && previousRoomCode !== normalizedCode) {
      socket.leave(previousRoomCode);
      removeSocketFromRoom(socket.id, previousRoomCode);
      delete socketToRoom[socket.id];
    }

    if (!room.players.some((p) => p.id === socket.id)) {
      room.players.push({ id: socket.id, name: playerName });
    }

    socketToRoom[socket.id] = normalizedCode;
    socket.join(normalizedCode);
    socket.emit("joined-room", buildRoomState(normalizedCode));
    broadcastRoomState(normalizedCode);
  });

  socket.on("leave-room", ({ code }) => {
    const normalizedCode = (code || "").trim().toUpperCase();
    const room = rooms[normalizedCode];
    if (!room) return;

    socket.leave(normalizedCode);
    removeSocketFromRoom(socket.id, normalizedCode);
    delete socketToRoom[socket.id];
  });

  socket.on("get-room-state", ({ code }) => {
    const normalizedCode = (code || "").trim().toUpperCase();
    const state = buildRoomState(normalizedCode);
    if (!state) {
      socket.emit("app-error", "Комната не найдена");
      return;
    }
    socket.emit("room-state", state);
  });

  socket.on("disconnect", () => {
    const roomCode = socketToRoom[socket.id];
    if (!roomCode) return;
    removeSocketFromRoom(socket.id, roomCode);
    delete socketToRoom[socket.id];
  });
});

server.listen(3000, "0.0.0.0", () => {
  console.log("Сервер запущен → http://0.0.0.0:3000");
});
