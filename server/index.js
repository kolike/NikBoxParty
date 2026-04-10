const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static("public"));

const rooms = {};

const characters = [
  "Бэтмен", "Гарри Поттер", "Элон Маск", "Тейлор Свифт", "Шерлок Холмс",
  "Железный Человек", "Майкл Джордан", "Мона Лиза", "Дарт Вейдер", "Фредди Меркьюри",
  "Спанч Боб", "Дональд Трамп", "Леонардо да Винчи", "Кот Шрёдингера", "Бабушка из Красной Шапочки"
];

function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on("connection", (socket) => {
  console.log("Подключился:", socket.id);

  socket.on("create-room", () => {
    const code = generateCode();
    rooms[code] = { 
      host: socket.id, 
      players: [], 
      gameState: null 
    };
    socket.join(code);
    socket.emit("room-created", code);
  });

  socket.on("join-room", ({ code, name }) => {
    const room = rooms[code];
    if (!room) {
      socket.emit("error", "Комната не найдена");
      return;
    }

    if (room.players.some(p => p.id === socket.id)) {
      io.to(code).emit("player-joined", room.players);
      return;
    }

    room.players.push({ id: socket.id, name: name || "Игрок" });
    socket.join(code);
    io.to(code).emit("player-joined", room.players);
  });

  socket.on("start-game", (code) => {
    const room = rooms[code];
    if (!room) return;

    // Выбираем случайного персонажа
    const character = characters[Math.floor(Math.random() * characters.length)];

    room.gameState = {
      phase: "playing",
      character: character,
      answers: {}   // socket.id → ответ игрока
    };

    console.log(`Игра началась в комнате ${code}. Персонаж: ${character}`);

    // Сообщаем всем, что игра началась
    io.to(code).emit("game-started", { character });
  });

  // Получаем ответ от игрока
  socket.on("submit-answer", ({ code, answer }) => {
    const room = rooms[code];
    if (!room || !room.gameState) return;

    room.gameState.answers[socket.id] = answer;

    // Отправляем обновлённые ответы только хосту
    const hostSocket = io.sockets.sockets.get(room.host);
    if (hostSocket) {
      hostSocket.emit("answers-updated", room.gameState.answers);
    }

    // Также можно отправить подтверждение игроку
    socket.emit("answer-received");
  });

  socket.on("disconnect", () => {
    for (let code in rooms) {
      const room = rooms[code];
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.gameState) {
        delete room.gameState.answers[socket.id];
      }
      io.to(code).emit("player-joined", room.players);
    }
  });
});

server.listen(3000, '0.0.0.0', () => {
  console.log("Сервер запущен → http://0.0.0.0:3000");
});
