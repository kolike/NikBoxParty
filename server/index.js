const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = {};

function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
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

app.use(express.static(path.join(__dirname, "..", "public")));
app.get("/", (req, res) => {
  res.redirect("/host.html");
});

io.on("connection", (socket) => {
  socket.on("create-room", () => {
    const code = generateCode();
    rooms[code] = {
      hostId: socket.id,
      players: [{ id: socket.id, name: "Ведущий" }],
    };
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

    if (!room.players.some((p) => p.id === socket.id)) {
      room.players.push({ id: socket.id, name: playerName });
    }

    socket.join(normalizedCode);
    socket.emit("joined-room", buildRoomState(normalizedCode));
    broadcastRoomState(normalizedCode);
  });

  socket.on("leave-room", ({ code }) => {
    const normalizedCode = (code || "").trim().toUpperCase();
    const room = rooms[normalizedCode];
    if (!room) return;

    room.players = room.players.filter((player) => player.id !== socket.id);
    socket.leave(normalizedCode);

    if (room.hostId === socket.id) {
      room.hostId = room.players[0]?.id || null;
    }

    if (room.players.length === 0) {
      delete rooms[normalizedCode];
      return;
    }

    broadcastRoomState(normalizedCode);
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

  socket.on("start-game", (code) => {
    const room = rooms[code];
    if (!room) {
      socket.emit("app-error", "Комната не найдена");
      return;
    }
    if (room.hostId !== socket.id) {
      socket.emit("app-error", "Только ведущий может начать игру");
    }
  });

  socket.on("disconnect", () => {
    Object.keys(rooms).forEach((code) => {
      const room = rooms[code];
      room.players = room.players.filter((player) => player.id !== socket.id);
      if (room.hostId === socket.id) {
        room.hostId = room.players[0]?.id || null;
      }
      if (room.players.length === 0) {
        delete rooms[code];
        return;
      }
      broadcastRoomState(code);
    });
  });
});

server.listen(3000, "0.0.0.0", () => {
  console.log("Сервер запущен → http://0.0.0.0:3000");
});
