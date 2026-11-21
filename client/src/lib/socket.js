// One shared Socket.IO connection for the whole app.
import { io } from 'socket.io-client';
import { SERVER_URL } from './config.js';

// WebSocket only (skips the slower long-polling start). Connects when first needed.
export const socket = io(SERVER_URL, {
  transports: ['websocket'],
  autoConnect: false,
});

// Opens the connection if it is not open yet.
export function ensureConnected() {
  if (!socket.connected) socket.connect();
  return socket;
}

// Sends an event and waits for the server's reply (the "ack"), with a timeout.
// Resolves to the reply, or { ok: false, error } if the server did not answer in time.
export function emitAck(event, payload = {}, timeoutMs = 10_000) {
  ensureConnected();
  return new Promise((resolve) => {
    socket.timeout(timeoutMs).emit(event, payload, (err, reply) => {
      if (err) resolve({ ok: false, error: 'The server did not answer. Check your connection.' });
      else resolve(reply);
    });
  });
}
