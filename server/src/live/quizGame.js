// The rules of a live MCQ game, as plain functions (no sockets, no timers), so they are easy to test.
// The socket code in quizSocket.js calls these and sends the results.

export const ANSWER_GRACE_MS = 300; // accept answers this late, to allow for network delay

// Fields every quiz player starts with.
export const newQuizPlayer = () => ({ score: 0, answers: [] });

// Points for a correct answer: 500 + up to 500 more for answering fast. Wrong = 0.
export function pointsFor(timeLeftMs, timeLimitMs) {
  const fraction = Math.max(0, Math.min(1, timeLeftMs / timeLimitMs));
  return 500 + Math.round(500 * fraction);
}

// Moves the room to the next question. Returns the payload for "question:start"
// (no correctIndex: students must not be able to see the answer).
export function startQuestion(room, now = Date.now()) {
  const index = room.phase === 'lobby' ? 0 : room.questionIndex + 1;
  const q = room.quiz.questions[index];
  const timeLimitMs = q.timeLimitSec * 1000;
  room.phase = 'question';
  room.questionIndex = index;
  room.questionStartedAt = now;
  room.questionEndsAt = now + timeLimitMs;
  room.currentAnswers = new Map(); // playerId -> { optionIndex, timeMs }
  room.optionCounts = [0, 0, 0, 0];
  if (index === 0) room.startedAt = now;
  return publicQuestion(room, now);
}

// The question as students see it, with the server's clock for countdown syncing.
export function publicQuestion(room, now = Date.now()) {
  const q = room.quiz.questions[room.questionIndex];
  return {
    index: room.questionIndex,
    total: room.quiz.questions.length,
    text: q.text,
    options: q.options,
    timeLimitSec: q.timeLimitSec,
    endsAt: room.questionEndsAt,
    serverNow: now,
  };
}

// Checks one answer against the spec's rules and records it. Returns { accepted, reason? }.
// The time is measured by the server's clock when the answer arrives, never the browser's.
export function submitAnswer(room, playerId, { index, optionIndex }, now = Date.now()) {
  const player = room.players.get(playerId);
  if (!player) return { accepted: false, reason: 'not-in-room' };
  if (room.phase !== 'question') return { accepted: false, reason: 'not-open' };
  if (index !== room.questionIndex) return { accepted: false, reason: 'wrong-question' };
  if (now > room.questionEndsAt + ANSWER_GRACE_MS) return { accepted: false, reason: 'too-late' };
  if (room.currentAnswers.has(playerId)) return { accepted: false, reason: 'already-answered' };
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 3) return { accepted: false, reason: 'bad-option' };

  room.currentAnswers.set(playerId, { optionIndex, timeMs: now - room.questionStartedAt });
  room.optionCounts[optionIndex] += 1;
  return { accepted: true };
}

// True when every connected student has answered (the question can close early).
export function everyoneAnswered(room) {
  const online = [...room.players.values()].filter((p) => p.connected);
  return online.length > 0 && online.every((p) => room.currentAnswers.has(p.playerId));
}

// Sorts players by score (highest first) and gives tied scores the same rank (1, 2, 2, 4).
export function rankPlayers(players) {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
  let rank = 0;
  let prevScore = null;
  sorted.forEach((p, i) => {
    if (p.score !== prevScore) {
      rank = i + 1;
      prevScore = p.score;
    }
    p.rank = rank;
  });
  return sorted;
}

// The shareable leaderboard row (no secret playerId).
const row = (p) => ({ publicId: p.publicId, nickname: p.nickname, score: p.score, rank: p.rank });

// Closes the current question: scores every player once, sorts once, and builds
// one shared "question:end" message plus a tiny personal result per player.
export function closeQuestion(room) {
  const q = room.quiz.questions[room.questionIndex];
  const timeLimitMs = q.timeLimitSec * 1000;
  room.phase = 'reveal';

  for (const player of room.players.values()) {
    const answer = room.currentAnswers.get(player.playerId);
    const correct = Boolean(answer && answer.optionIndex === q.correctIndex);
    const points = correct ? pointsFor(timeLimitMs - answer.timeMs, timeLimitMs) : 0;
    player.score += points;
    player.answers[room.questionIndex] = answer
      ? { optionIndex: answer.optionIndex, correct, timeMs: answer.timeMs, points }
      : { optionIndex: null, correct: false, timeMs: null, points: 0 };
  }

  const ranked = rankPlayers(room.players.values());
  const shared = {
    index: room.questionIndex,
    correctIndex: q.correctIndex,
    explanation: q.explanation || '',
    counts: room.optionCounts,
    answered: room.currentAnswers.size,
    top10: ranked.slice(0, 10).map(row),
    isLast: room.questionIndex === room.quiz.questions.length - 1,
  };
  const personal = ranked.map((p) => ({
    socketId: p.socketId,
    playerId: p.playerId,
    result: personalResult(p, room.questionIndex, ranked.length),
  }));
  return { shared, personal };
}

// What one student sees after a question: right/wrong, points, total score, rank.
export function personalResult(player, index, total) {
  const a = player.answers[index] || { correct: false, points: 0, optionIndex: null };
  return { correct: a.correct, points: a.points, answered: a.optionIndex !== null, score: player.score, rank: player.rank, of: total };
}

// Ends the game. Returns the "game:over" payload.
export function finishQuiz(room, now = Date.now()) {
  room.phase = 'finished';
  room.endedAt = now;
  const ranked = rankPlayers(room.players.values());
  return { podium: ranked.slice(0, 3).map(row), top10: ranked.slice(0, 10).map(row), total: ranked.length };
}

// Builds the MongoDB Session document for a finished quiz (written once).
export function quizSessionDoc(room) {
  const ranked = rankPlayers(room.players.values());
  return {
    kind: 'quiz',
    owner: room.hostUserId,
    title: room.title,
    code: room.code,
    quiz: room.quiz._id,
    startedAt: room.startedAt ? new Date(room.startedAt) : null,
    endedAt: new Date(room.endedAt || Date.now()),
    questions: room.quiz.questions.map((q) => ({ text: q.text, options: q.options, correctIndex: q.correctIndex })),
    players: ranked.map((p) => ({
      nickname: p.nickname,
      score: p.score,
      rank: p.rank,
      answers: room.quiz.questions.map((_, i) => p.answers[i] || { optionIndex: null, correct: false, timeMs: null, points: 0 }),
    })),
  };
}
