function registerSocketHandlers({ io, roomManager }) {
  io.on('connection', (socket) => {
    socket.on('create-room', () => {
      try {
        const room = roomManager.createRoom({ hostId: socket.id });
        socket.join(room.code);
        socket.emit('room-created', {
          code: room.code,
          state: room.snapshotForHost(),
        });
      } catch (error) {
        socket.emit('app-error', error.message);
      }
    });

    socket.on('join-room', ({ code, name }) => {
      try {
        const normalizedCode = (code || '').trim().toUpperCase();
        if (normalizedCode.length !== 4) {
          throw new Error('Код комнаты должен состоять из 4 символов');
        }

        const room = roomManager.joinRoom({
          code: normalizedCode,
          socketId: socket.id,
          name,
        });

        socket.join(normalizedCode);

        socket.emit('joined-room', room.snapshotForPlayer());
        io.to(normalizedCode).emit('room-state-updated', room.snapshotForHost());
      } catch (error) {
        socket.emit('app-error', error.message);
      }
    });

    socket.on('start-game', ({ code }) => {
      try {
        const room = roomManager.getRoom(code);
        if (!room) {
          throw new Error('Комната не найдена');
        }

        const payload = room.startGame({ initiatedBy: socket.id });
        io.to(code).emit('game-started', payload);
        io.to(code).emit('room-state-updated', room.snapshotForHost());
      } catch (error) {
        socket.emit('app-error', error.message);
      }
    });

    socket.on('submit-answer', ({ code, answer }) => {
      try {
        const room = roomManager.getRoom(code);
        if (!room) {
          throw new Error('Комната не найдена');
        }

        room.submitAnswer({ socketId: socket.id, answer });

        socket.emit('answer-received');

        if (room.hostId) {
          io.to(room.hostId).emit('answers-updated', room.listAnswers());
        }
      } catch (error) {
        socket.emit('app-error', error.message);
      }
    });

    socket.on('disconnect', () => {
      const result = roomManager.leaveBySocket(socket.id);
      if (!result || result.deleted) {
        return;
      }

      io.to(result.code).emit('room-state-updated', result.room.snapshotForHost());
      if (result.room.hostId) {
        io.to(result.room.hostId).emit('host-promoted', {
          code: result.code,
          hostId: result.room.hostId,
        });
      }
    });
  });
}

module.exports = {
  registerSocketHandlers,
};
