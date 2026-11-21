// Load test for the live MCQ quiz: N simulated students join one room and answer every question.
// It starts its own server in this process on a free port with an in-memory quiz (no database needed),
// then measures join time, answer acknowledgement latency, reveal fan-out time and lost answers.
// Usage: node scripts/load-test.js --players 300 --questions 5
import http from 'node:http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { config } from '../src/config.js';
import { createApp } from '../src/app.js';
import { attachSockets } from '../src/live/sockets.js';
import { createRoom } from '../src/live/rooms.js';
import { newQuizRoomFields } from '../src/live/quizSocket.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : fallback;
};
const PLAYERS = arg('players', 100);
const QUESTIONS = arg('questions', 5);
const TIME_LIMIT = arg('seconds', 6);

const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 1. Server (same code as production, without MongoDB: the final save just fails and is logged).
config.jwtSecret ||= 'load-test-secret';
const server = http.createServer(createApp());
const io = new Server(server, { perMessageDeflate: false });
attachSockets(io);
await new Promise((resolve) => server.listen(0, resolve));
const url = `http://localhost:${server.address().port}`;
console.error = () => {}; // silence the expected "could not save session" (no database here)

const quiz = {
  _id: 'load-test',
  questions: Array.from({ length: QUESTIONS }, (_, i) => ({
    text: `Load test question ${i + 1}?`,
    options: ['A', 'B', 'C', 'D'],
    correctIndex: i % 4,
    timeLimitSec: TIME_LIMIT,
  })),
};
const room = createRoom({ kind: 'quiz', hostUserId: 'load-host', title: 'Load test', ...newQuizRoomFields(quiz) });
const memBefore = process.memoryUsage().heapUsed;
const cpuBefore = process.cpuUsage();

// 2. Host.
const host = connect(url, { transports: ['websocket'], forceNew: true });
await new Promise((resolve) => host.once('connect', resolve));
await new Promise((resolve) => host.emit('host:join', { code: room.code, token: jwt.sign({ sub: 'load-host' }, config.jwtSecret) }, resolve));

// 3. Students join in batches of 50.
const ackLatencies = [];
const fanOut = []; // per question: { first, last } time any client received question:end
const seenEnd = (index) => {
  const now = performance.now();
  fanOut[index] ||= { first: now, last: now };
  fanOut[index].first = Math.min(fanOut[index].first, now);
  fanOut[index].last = Math.max(fanOut[index].last, now);
};
let sent = 0;
let acked = 0;
let endReceived = 0;
const joinStart = performance.now();
const bots = [];
for (let i = 0; i < PLAYERS; i += 50) {
  const batch = [];
  for (let j = i; j < Math.min(PLAYERS, i + 50); j += 1) {
    batch.push(
      (async () => {
        const s = connect(url, { transports: ['websocket'], forceNew: true });
        await new Promise((resolve, reject) => {
          s.once('connect', resolve);
          s.once('connect_error', reject);
        });
        const reply = await new Promise((resolve) => s.emit('player:join', { code: room.code, nickname: `bot${j}` }, resolve));
        if (!reply.ok) throw new Error(reply.error);
        // Answer each question after a random delay (0.2 to 4 s), like a real class.
        s.on('question:start', (q) => {
          setTimeout(() => {
            const t0 = performance.now();
            sent += 1;
            s.emit('answer:submit', { index: q.index, optionIndex: Math.floor(Math.random() * 4) }, (ack) => {
              if (ack?.accepted) {
                acked += 1;
                ackLatencies.push(performance.now() - t0);
              }
            });
          }, 200 + Math.random() * 3800);
        });
        s.on('question:end', (r) => {
          endReceived += 1;
          seenEnd(r.index);
        });
        bots.push(s);
      })(),
    );
  }
  await Promise.all(batch);
}
const joinMs = performance.now() - joinStart;

// 4. Run the game: start, then "next" after each reveal.
host.on('question:end', (r) => seenEnd(r.index));
const gameStart = performance.now();
for (let q = 0; q < QUESTIONS; q += 1) {
  const ended = new Promise((resolve) => host.once('question:end', resolve));
  await new Promise((resolve) => host.emit(q === 0 ? 'quiz:start' : 'quiz:next', {}, resolve));
  await ended;
  await sleep(500); // let every bot receive the reveal
}
await new Promise((resolve) => host.emit('quiz:next', {}, resolve)); // -> game over
const gameMs = performance.now() - gameStart;

const memAfter = process.memoryUsage().heapUsed;
const cpu = process.cpuUsage(cpuBefore);

// 5. Report.
const rows = {
  players: PLAYERS,
  questions: QUESTIONS,
  'join all (ms)': Math.round(joinMs),
  'answers sent': sent,
  'answers acked': acked,
  'answers lost': sent - acked,
  'ack p50 (ms)': percentile(ackLatencies, 50).toFixed(1),
  'ack p95 (ms)': percentile(ackLatencies, 95).toFixed(1),
  'ack p99 (ms)': percentile(ackLatencies, 99).toFixed(1),
  'reveal fan-out p95 (ms)': percentile(fanOut.filter(Boolean).map((f) => f.last - f.first), 95).toFixed(1),
  'reveals received': `${endReceived}/${PLAYERS * QUESTIONS}`,
  'heap growth (MB)': ((memAfter - memBefore) / 1024 / 1024).toFixed(1),
  'server+bots CPU (s)': ((cpu.user + cpu.system) / 1e6).toFixed(1),
  'game time (s)': (gameMs / 1000).toFixed(1),
};
console.log(JSON.stringify(rows));
bots.forEach((b) => b.close());
host.close();
io.close();
server.close();
process.exit(0);
