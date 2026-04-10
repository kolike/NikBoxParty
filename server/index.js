const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const { RoomManager } = require('./src/services/RoomManager');
const { registerSocketHandlers } = require('./src/socket/registerSocketHandlers');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const roomManager = new RoomManager();
registerSocketHandlers({ io, roomManager });

const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, now: new Date().toISOString() });
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server started on http://0.0.0.0:${PORT}`);
});
