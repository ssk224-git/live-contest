// Socket events for a live MCQ quiz. The rules live in quizGame.js; this file sends messages and runs timers.
import { Session } from '../models/Session.js';
import {
  ANSWER_GRACE_MS,
  newQuizPlayer,
  startQuestion,
  publicQuestion,
  submitAnswer,
  everyoneAnswered,
  closeQuestion,
  personalResult,
  finishQuiz,
  quizSessionDoc,
  rankPlayers,
} from './quizGame.js';
import { onlineCount } from './rooms.js';

let io; // the Socket.IO server, set by registerQuizHandlers

// Extra room fields for a quiz (added to the common room fields in rooms.js).
export const newQuizRoomFields = (quiz) => ({
  quiz,
  questionIndex: -1,
  questionStartedAt: null,
  questionEndsAt: null,
  currentAnswers: new Map(),
  optionCounts: [0, 0, 0, 0],
  lastReveal: null,
  gameOver: null,
  sessionId: null,
  hostUpdateTimer: null,
  recent: [], // the last few nicknames that joined, for the host's lobby screen
});

export const makeQuizPlayer = newQuizPlayer;

// Sends the host a summary at most twice a second (never one message per join or per answer).
export function scheduleQuizHostUpdate(room) {
  if (room.hostUpdateTimer) return;
  room.hostUpdateTimer = setTimeout(() => {
    room.hostUpdateTimer = null;
    io.to(`${room.code}:host`).emit('lobby:update', { count: onlineCount(room), total: room.players.size, recent: room.recent });
    if (room.phase === 'question') {
      io.to(`${room.code}:host`).emit('answers:progress', { answered: room.currentAnswers.size, total: onlineCount(room) });
    }
  }, 500);
}

// Starts the next question and the server-side timer that closes it.
function runQuestion(room) {
  const payload = startQuestion(room);
  io.to(room.code).emit('question:start', payload);
  clearTimeout(room.timer);
  room.timer = setTimeout(() => closeNow(room), payload.endsAt - Date.now() + ANSWER_GRACE_MS);
  scheduleQuizHostUpdate(room);
}

// Closes the current question: one shared message for the room + one tiny result per student.
function closeNow(room) {
  clearTimeout(room.timer);
  if (room.phase !== 'question') return;
  const { shared, personal } = closeQuestion(room);
  room.lastReveal = shared;
  io.to(room.code).emit('question:end', shared);
  for (const { socketId, result } of personal) {
    if (socketId) io.to(socketId).emit('player:result', result);
  }
}

// Ends the game, tells everyone, and saves the results to MongoDB (one write).
async function endQuiz(room) {
  clearTimeout(room.timer);
  if (room.phase === 'question') closeNow(room);
  room.gameOver = finishQuiz(room);
  io.to(room.code).emit('game:over', room.gameOver);
  // Personal final rank for each student.
  for (const p of room.players.values()) {
    if (p.connected) io.to(p.socketId).emit('player:final', { rank: p.rank, score: p.score, of: room.players.size });
  }
  try {
    const doc = await Session.create(quizSessionDoc(room));
    room.sessionId = doc._id.toString();
    io.to(`${room.code}:host`).emit('session:saved', { sessionId: room.sessionId });
  } catch (err) {
    console.error(`[quiz] could not save session ${room.code}:`, err.message);
    io.to(`${room.code}:host`).emit('session:saved', { error: 'Results could not be saved to the database' });
  }
}

// What the host's screen needs right now (also used after a host refresh).
export function quizHostState(room) {
  const inQuestion = room.phase === 'question';
  return {
    kind: 'quiz',
    code: room.code,
    title: room.title,
    phase: room.phase,
    count: onlineCount(room),
    recent: room.recent,
    totalQuestions: room.quiz.questions.length,
    question: room.questionIndex >= 0 && room.phase !== 'lobby' ? publicQuestion(room) : null,
    answered: inQuestion ? room.currentAnswers.size : 0,
    reveal: room.phase === 'reveal' ? room.lastReveal : null,
    gameOver: room.gameOver,
    sessionId: room.sessionId,
  };
}

// What one student's screen needs right now (also used after a refresh, so they rejoin mid-question).
export function quizPlayerState(room, player) {
  const state = { phase: room.phase, title: room.title, score: player.score, rank: player.rank ?? null };
  if (room.phase === 'question') {
    state.question = publicQuestion(room);
    const mine = room.currentAnswers.get(player.playerId);
    state.myAnswer = mine ? mine.optionIndex : null;
  }
  if (room.phase === 'reveal') {
    state.question = publicQuestion(room); // so a student who refreshed can see what the answer was
    state.reveal = room.lastReveal;
    state.result = personalResult(player, room.questionIndex, room.players.size);
  }
  if (room.phase === 'finished') {
    state.gameOver = room.gameOver;
    state.final = { rank: player.rank, score: player.score, of: room.players.size };
  }
  return state;
}

// Called when a student joins or rejoins.
export function onQuizPlayerJoined(room, player, rejoined) {
  if (!rejoined) {
    room.recent = [...room.recent, player.nickname].slice(-12);
    if (room.phase !== 'lobby') rankPlayers(room.players.values()); // give a late joiner a rank
  }
  scheduleQuizHostUpdate(room);
}

// Called when a student's connection drops.
export function onQuizPlayerLeft(room) {
  scheduleQuizHostUpdate(room);
  if (room.phase === 'question' && everyoneAnswered(room)) closeNow(room);
}

// Registers the quiz events on one socket. helpers.hostRoom/playerRoom check who is asking.
export function registerQuizHandlers(server, socket, { hostRoom, playerRoom }) {
  io = server;

  // Host: lobby -> first question.
  socket.on('quiz:start', (payload, ack) => {
    const room = hostRoom(socket, 'quiz');
    if (!room) return reply(ack, { ok: false, error: 'Not the host of a quiz' });
    if (room.phase !== 'lobby') return reply(ack, { ok: false, error: 'The quiz has already started' });
    if (room.players.size === 0) return reply(ack, { ok: false, error: 'Wait for at least one student to join' });
    runQuestion(room);
    reply(ack, { ok: true });
  });

  // Host: reveal -> next question, or the end after the last one.
  socket.on('quiz:next', async (payload, ack) => {
    const room = hostRoom(socket, 'quiz');
    if (!room || room.phase !== 'reveal') return reply(ack, { ok: false, error: 'Nothing to move on from' });
    if (room.questionIndex >= room.quiz.questions.length - 1) await endQuiz(room);
    else runQuestion(room);
    reply(ack, { ok: true });
  });

  // Host: close the current question now (e.g. everyone in the room has answered out loud).
  socket.on('quiz:skip', (payload, ack) => {
    const room = hostRoom(socket, 'quiz');
    if (!room || room.phase !== 'question') return reply(ack, { ok: false });
    closeNow(room);
    reply(ack, { ok: true });
  });

  // Host: end the whole game early.
  socket.on('quiz:end', async (payload, ack) => {
    const room = hostRoom(socket, 'quiz');
    if (!room || room.phase === 'finished') return reply(ack, { ok: false });
    await endQuiz(room);
    reply(ack, { ok: true });
  });

  // Student: answer the current question.
  socket.on('answer:submit', (payload, ack) => {
    const found = playerRoom(socket, 'quiz');
    if (!found) return reply(ack, { accepted: false, reason: 'not-in-room' });
    const { room, player } = found;
    const result = submitAnswer(room, player.playerId, { index: payload?.index, optionIndex: payload?.optionIndex });
    reply(ack, result);
    if (!result.accepted) return;
    scheduleQuizHostUpdate(room);
    if (everyoneAnswered(room)) closeNow(room);
  });
}

// Calls the client's ack callback if it sent one.
function reply(ack, value) {
  if (typeof ack === 'function') ack(value);
}
