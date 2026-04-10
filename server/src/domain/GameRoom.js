const { CHARACTERS, PHASES } = require('../constants');
const { randomFrom } = require('../utils');

class GameRoom {
  constructor({ code, hostId }) {
    this.code = code;
    this.hostId = hostId;
    this.phase = PHASES.LOBBY;
    this.players = new Map();
    this.currentCharacter = null;
    this.answers = new Map();
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  touch() {
    this.updatedAt = Date.now();
  }

  ensureHost(socketId) {
    if (socketId !== this.hostId) {
      throw new Error('Только ведущий может выполнить это действие');
    }
  }

  addPlayer({ id, name }) {
    if (this.players.has(id)) {
      return;
    }

    this.players.set(id, {
      id,
      name: name || 'Игрок',
      joinedAt: Date.now(),
    });
    this.touch();
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    this.answers.delete(socketId);

    if (this.hostId === socketId) {
      this.hostId = null;
    }

    this.touch();
  }

  promoteNextHost() {
    const next = this.players.values().next().value;
    this.hostId = next ? next.id : null;
    this.touch();
    return this.hostId;
  }

  startGame({ initiatedBy }) {
    this.ensureHost(initiatedBy);

    if (this.players.size === 0) {
      throw new Error('Нельзя начать игру без игроков');
    }

    this.phase = PHASES.PLAYING;
    this.currentCharacter = randomFrom(CHARACTERS);
    this.answers.clear();
    this.touch();

    return {
      phase: this.phase,
      character: this.currentCharacter,
    };
  }

  submitAnswer({ socketId, answer }) {
    if (this.phase !== PHASES.PLAYING) {
      throw new Error('Сейчас нельзя отправлять ответы');
    }

    if (!this.players.has(socketId)) {
      throw new Error('Игрок не найден в комнате');
    }

    const cleanAnswer = (answer || '').trim();
    if (!cleanAnswer) {
      throw new Error('Ответ не может быть пустым');
    }

    if (cleanAnswer.length > 80) {
      throw new Error('Ответ слишком длинный (максимум 80 символов)');
    }

    this.answers.set(socketId, cleanAnswer);
    this.touch();
  }

  listPlayers() {
    return Array.from(this.players.values());
  }

  listAnswers() {
    const byId = {};
    this.answers.forEach((answer, id) => {
      byId[id] = answer;
    });
    return byId;
  }

  snapshotForHost() {
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      players: this.listPlayers(),
      answers: this.listAnswers(),
      currentCharacter: this.currentCharacter,
    };
  }

  snapshotForPlayer() {
    return {
      code: this.code,
      phase: this.phase,
      players: this.listPlayers(),
    };
  }

  isEmpty() {
    return this.players.size === 0 && !this.hostId;
  }
}

module.exports = {
  GameRoom,
};
