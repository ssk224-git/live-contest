// Starts everything: the Express app, the Socket.IO server on the same port, and MongoDB.
import http from 'node:http';
import { Server } from 'socket.io';
import { config } from './config.js';
import { connectDb } from './db.js';
import { createApp } from './app.js';
import { attachSockets } from './live/sockets.js';

const app = createApp();
const server = http.createServer(app);

// Socket.IO shares the HTTP server. Compression is off: messages are tiny and compression costs CPU.
const io = new Server(server, {
  cors: { origin: config.clientUrls },
  perMessageDeflate: false,
});
attachSockets(io);

connectDb().catch((err) => console.error('[db] could not connect:', err.message));

server.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
});
