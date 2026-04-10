const { GameRoom } = require('../domain/GameRoom');
const { generateCode } = require('../utils');

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.socketToRoom = new Map();
  }

  createRoom({ hostId }) {
    const code = generateCode(new Set(this.rooms.keys()));
    const room = new GameRoom({ code, hostId });

    this.rooms.set(code, room);
    this.socketToRoom.set(hostId, code);

    return room;
  }

  getRoom(code) {
    return this.rooms.get(code);
  }

  joinRoom({ code, socketId, name }) {
    const room = this.getRoom(code);
    if (!room) {
      throw new Error('Комната не найдена');
    }

    room.addPlayer({ id: socketId, name });
    this.socketToRoom.set(socketId, code);

    return room;
  }

  leaveBySocket(socketId) {
    const code = this.socketToRoom.get(socketId);
    if (!code) {
      return null;
    }

    const room = this.rooms.get(code);
    this.socketToRoom.delete(socketId);

    if (!room) {
      return null;
    }

    room.removePlayer(socketId);

    if (!room.hostId && room.players.size > 0) {
      room.promoteNextHost();
    }

    if (room.isEmpty()) {
      this.rooms.delete(code);
      return { code, room: null, deleted: true };
    }

    return { code, room, deleted: false };
  }
}

module.exports = {
  RoomManager,
};
