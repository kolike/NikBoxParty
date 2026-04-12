const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static('public'));

const rooms = {};

const PROMPTS = [
  'Я так устал, что ...',
  'На корпоративе я случайно ...',
  'Мой кот понял, что завтра понедельник, и ...',
  'Самая странная причина опоздания: ...',
  'Новый лайфхак продуктивности: ...',
  'Если бы будильник умел говорить, он бы сказал: ...',
  'На первом свидании я впечатлил(а) человека тем, что ...',
  'Когда отключили интернет, вся семья ...',
  'Мой секрет уверенности перед созвоном: ...',
  'Самый бесполезный супергерой — это тот, кто может ...',
];

function generateCode(existingRooms) {
  let code = Math.random().toString(36).substring(2, 6).toUpperCase();
  while (existingRooms[code]) {
    code = Math.random().toString(36).substring(2, 6).toUpperCase();
  }
  return code;
}

function getPublicPlayers(room) {
  return room.players.map((player) => ({
    id: player.id,
    name: player.name,
    score: player.score,
  }));
}

function buildLeaderboard(room) {
  return getPublicPlayers(room).sort((a, b) => b.score - a.score);
}

function buildVoteOptions(room) {
  const entries = Object.entries(room.gameState.answers);
  const shuffled = [...entries].sort(() => Math.random() - 0.5);

  return shuffled.map(([playerId, text], index) => ({
    optionId: index + 1,
    playerId,
    text,
  }));
}

function startRound(room) {
  room.gameState = {
    phase: 'answering',
    prompt: PROMPTS[Math.floor(Math.random() * PROMPTS.length)],
    answers: {},
    options: [],
    votesByVoter: {},
    voteCounts: {},
  };
}

function sanitizeAnswer(input) {
  return String(input || '').trim().slice(0, 120);
}

io.on('connection', (socket) => {
  console.log('Подключился:', socket.id);

  socket.on('create-room', () => {
    const code = generateCode(rooms);
    rooms[code] = {
      host: socket.id,
      players: [],
      gameState: null,
    };

    socket.join(code);
    socket.emit('room-created', code);
  });

  socket.on('join-room', ({ code, name }) => {
    const roomCode = String(code || '').trim().toUpperCase();
    const room = rooms[roomCode];

    if (!room) {
      socket.emit('app-error', 'Комната не найдена');
      return;
    }

    const existing = room.players.find((player) => player.id === socket.id);
    if (!existing) {
      room.players.push({
        id: socket.id,
        name: String(name || 'Игрок').trim() || 'Игрок',
        score: 0,
      });
    }

    socket.join(roomCode);
    socket.emit('joined-room', {
      code: roomCode,
      hostId: room.host,
      players: getPublicPlayers(room),
      gameState: room.gameState,
    });

    io.to(roomCode).emit('player-joined', getPublicPlayers(room));
  });

  socket.on('start-game', ({ code }) => {
    const roomCode = String(code || '').trim().toUpperCase();
    const room = rooms[roomCode];

    if (!room) {
      socket.emit('app-error', 'Комната не найдена');
      return;
    }

    if (socket.id !== room.host) {
      socket.emit('app-error', 'Только ведущий может начать раунд');
      return;
    }

    if (room.players.length === 0) {
      socket.emit('app-error', 'Нужен хотя бы один игрок');
      return;
    }

    startRound(room);

    io.to(roomCode).emit('game-started', {
      phase: room.gameState.phase,
      prompt: room.gameState.prompt,
      players: getPublicPlayers(room),
      leaderboard: buildLeaderboard(room),
    });
  });

  socket.on('submit-answer', ({ code, answer }) => {
    const roomCode = String(code || '').trim().toUpperCase();
    const room = rooms[roomCode];

    if (!room || !room.gameState || room.gameState.phase !== 'answering') {
      socket.emit('app-error', 'Сейчас нельзя отправить добивку');
      return;
    }

    if (!room.players.some((player) => player.id === socket.id)) {
      socket.emit('app-error', 'Игрок не найден в комнате');
      return;
    }

    const clean = sanitizeAnswer(answer);
    if (!clean) {
      socket.emit('app-error', 'Добивка не может быть пустой');
      return;
    }

    room.gameState.answers[socket.id] = clean;

    socket.emit('answer-received');

    io.to(room.host).emit('answers-updated', {
      totalPlayers: room.players.length,
      submittedCount: Object.keys(room.gameState.answers).length,
      answers: room.gameState.answers,
    });
  });

  socket.on('open-voting', ({ code }) => {
    const roomCode = String(code || '').trim().toUpperCase();
    const room = rooms[roomCode];

    if (!room || !room.gameState) {
      socket.emit('app-error', 'Игра не запущена');
      return;
    }

    if (socket.id !== room.host) {
      socket.emit('app-error', 'Только ведущий может открыть голосование');
      return;
    }

    const answerCount = Object.keys(room.gameState.answers).length;
    if (answerCount < 2) {
      socket.emit('app-error', 'Для голосования нужно минимум 2 добивки');
      return;
    }

    room.gameState.phase = 'voting';
    room.gameState.options = buildVoteOptions(room);
    room.gameState.votesByVoter = {};
    room.gameState.voteCounts = {};

    room.gameState.options.forEach((option) => {
      room.gameState.voteCounts[option.optionId] = 0;
    });

    io.to(roomCode).emit('voting-opened', {
      prompt: room.gameState.prompt,
      options: room.gameState.options.map((option) => ({
        optionId: option.optionId,
        text: option.text,
      })),
    });
  });

  socket.on('submit-vote', ({ code, optionId }) => {
    const roomCode = String(code || '').trim().toUpperCase();
    const room = rooms[roomCode];
    const selectedOption = Number(optionId);

    if (!room || !room.gameState || room.gameState.phase !== 'voting') {
      socket.emit('app-error', 'Сейчас нельзя голосовать');
      return;
    }

    if (room.gameState.votesByVoter[socket.id]) {
      socket.emit('app-error', 'Ты уже проголосовал(а) в этом раунде');
      return;
    }

    const option = room.gameState.options.find((item) => item.optionId === selectedOption);
    if (!option) {
      socket.emit('app-error', 'Вариант не найден');
      return;
    }

    if (option.playerId === socket.id) {
      socket.emit('app-error', 'Нельзя голосовать за свою добивку');
      return;
    }

    room.gameState.votesByVoter[socket.id] = selectedOption;
    room.gameState.voteCounts[selectedOption] += 1;

    socket.emit('vote-accepted');

    io.to(room.host).emit('votes-updated', {
      votedCount: Object.keys(room.gameState.votesByVoter).length,
      totalPlayers: room.players.length,
    });
  });

  socket.on('finish-round', ({ code }) => {
    const roomCode = String(code || '').trim().toUpperCase();
    const room = rooms[roomCode];

    if (!room || !room.gameState || room.gameState.phase !== 'voting') {
      socket.emit('app-error', 'Раунд нельзя завершить');
      return;
    }

    if (socket.id !== room.host) {
      socket.emit('app-error', 'Только ведущий может завершить раунд');
      return;
    }

    const results = room.gameState.options.map((option) => ({
      optionId: option.optionId,
      text: option.text,
      votes: room.gameState.voteCounts[option.optionId] || 0,
      playerId: option.playerId,
    }));

    results.forEach((result) => {
      const player = room.players.find((item) => item.id === result.playerId);
      if (player) {
        player.score += result.votes;
      }
    });

    room.gameState.phase = 'results';

    io.to(roomCode).emit('round-results', {
      prompt: room.gameState.prompt,
      results: results
        .map(({ optionId, text, votes }) => ({ optionId, text, votes }))
        .sort((a, b) => b.votes - a.votes),
      leaderboard: buildLeaderboard(room),
    });
  });

  socket.on('disconnect', () => {
    for (const code of Object.keys(rooms)) {
      const room = rooms[code];
      const wasHost = room.host === socket.id;
      const beforeCount = room.players.length;

      room.players = room.players.filter((player) => player.id !== socket.id);

      if (room.gameState) {
        delete room.gameState.answers?.[socket.id];
        delete room.gameState.votesByVoter?.[socket.id];
      }

      if (wasHost) {
        room.host = room.players[0]?.id || null;
      }

      if (room.players.length === 0 && !room.host) {
        delete rooms[code];
        continue;
      }

      if (beforeCount !== room.players.length || wasHost) {
        io.to(code).emit('player-joined', getPublicPlayers(room));
      }
    }
  });
});

server.listen(3000, '0.0.0.0', () => {
  console.log('Сервер запущен → http://0.0.0.0:3000');
});
