// Starts a real HTTP + Socket.IO server on a random port for socket tests, and gives
// small helpers to connect bots and wait for events.
import http from 'node:http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { attachSockets } from '../src/live/sockets.js';

export async function startSocketServer() {
  if (!config.jwtSecret) config.jwtSecret = 'test-secret';
  const server = http.createServer(createApp());
  const io = new Server(server, { perMessageDeflate: false });
  attachSockets(io);
  await new Promise((resolve) => server.listen(0, resolve));
  const url = `http://localhost:${server.address().port}`;
  const clients = [];
  return {
    url,
    io,
    // Connects a bot. Every message it receives is recorded in bot.log as [event, payload].
    async bot() {
      const socket = connect(url, { transports: ['websocket'], forceNew: true });
      socket.log = [];
      socket.onAny((event, payload) => socket.log.push([event, payload]));
      clients.push(socket);
      await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      return socket;
    },
    async close() {
      clients.forEach((c) => c.close());
      io.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

// A host token for a made-up user id (the server only checks the signature).
export const hostToken = (userId) => jwt.sign({ sub: userId, name: 'Host' }, config.jwtSecret, { expiresIn: '1h' });

// emit with an ack, as a promise.
export const ask = (socket, event, payload = {}) => new Promise((resolve) => socket.emit(event, payload, resolve));

// Waits for the next `event` on a socket (or rejects after timeoutMs).
export function waitFor(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
