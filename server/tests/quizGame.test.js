// Unit tests for the MCQ game rules (no sockets, fake clock).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, addOrRejoinPlayer, deleteRoom } from '../src/live/rooms.js';
import { newQuizRoomFields } from '../src/live/quizSocket.js';
import { pointsFor, startQuestion, submitAnswer, closeQuestion, finishQuiz, rankPlayers, newQuizPlayer, everyoneAnswered } from '../src/live/quizGame.js';

const quiz = {
  _id: 'q1',
  questions: [
    { text: 'Q one?', options: ['a', 'b', 'c', 'd'], correctIndex: 2, timeLimitSec: 20 },
    { text: 'Q two?', options: ['a', 'b', 'c', 'd'], correctIndex: 0, timeLimitSec: 10 },
  ],
};

function makeRoom() {
  const room = createRoom({ kind: 'quiz', hostUserId: 'u1', title: 'T', ...newQuizRoomFields(quiz) });
  const add = (nickname) => addOrRejoinPlayer(room, { nickname, socketId: nickname }, newQuizPlayer).player;
  return { room, add };
}

test('pointsFor: 1000 for instant, 500 at the buzzer, clamped', () => {
  assert.equal(pointsFor(20_000, 20_000), 1000);
  assert.equal(pointsFor(10_000, 20_000), 750);
  assert.equal(pointsFor(0, 20_000), 500);
  assert.equal(pointsFor(-300, 20_000), 500);
});

test('question:start payload never contains the correct answer', () => {
  const { room } = makeRoom();
  const payload = startQuestion(room, 1000);
  assert.equal('correctIndex' in payload, false);
  assert.equal(JSON.stringify(payload).includes('correct'), false);
  deleteRoom(room.code);
});

test('answer rules: wrong index, late, duplicate and bad option are rejected', () => {
  const { room, add } = makeRoom();
  const a = add('Asha');
  const b = add('Ben');
  startQuestion(room, 0); // ends at 20_000
  assert.deepEqual(submitAnswer(room, a.playerId, { index: 1, optionIndex: 2 }, 100), { accepted: false, reason: 'wrong-question' });
  assert.deepEqual(submitAnswer(room, a.playerId, { index: 0, optionIndex: 9 }, 100), { accepted: false, reason: 'bad-option' });
  assert.deepEqual(submitAnswer(room, a.playerId, { index: 0, optionIndex: 2 }, 5000), { accepted: true });
  assert.deepEqual(submitAnswer(room, a.playerId, { index: 0, optionIndex: 1 }, 6000), { accepted: false, reason: 'already-answered' });
  assert.deepEqual(submitAnswer(room, b.playerId, { index: 0, optionIndex: 1 }, 20_301), { accepted: false, reason: 'too-late' });
  assert.deepEqual(submitAnswer(room, 'nobody', { index: 0, optionIndex: 1 }, 100), { accepted: false, reason: 'not-in-room' });
  assert.equal(everyoneAnswered(room), false);
  assert.deepEqual(submitAnswer(room, b.playerId, { index: 0, optionIndex: 1 }, 20_250), { accepted: true }, 'within the 300 ms grace');
  assert.equal(everyoneAnswered(room), true);
  deleteRoom(room.code);
});

test('a full 2-question game matches a hand calculation', () => {
  const { room, add } = makeRoom();
  const a = add('Asha');
  const b = add('Ben');
  const c = add('Chen');

  // Q1 (20 s, answer 2): Asha correct at 5 s, Ben correct at 15 s, Chen wrong.
  startQuestion(room, 0);
  submitAnswer(room, a.playerId, { index: 0, optionIndex: 2 }, 5000);
  submitAnswer(room, b.playerId, { index: 0, optionIndex: 2 }, 15000);
  submitAnswer(room, c.playerId, { index: 0, optionIndex: 0 }, 1000);
  const r1 = closeQuestion(room);
  // Asha: 500 + round(500 * 15/20) = 875. Ben: 500 + round(500 * 5/20) = 625. Chen: 0.
  assert.deepEqual(r1.shared.counts, [1, 0, 2, 0]);
  assert.deepEqual(r1.shared.top10.map((r) => [r.nickname, r.score, r.rank]), [['Asha', 875, 1], ['Ben', 625, 2], ['Chen', 0, 3]]);
  assert.equal(r1.shared.correctIndex, 2);
  assert.equal(JSON.stringify(r1.shared).includes(a.playerId), false, 'secret playerId is never broadcast');

  // Q2 (10 s, answer 0): Chen correct at 1 s, Asha no answer, Ben wrong.
  startQuestion(room, 30_000);
  submitAnswer(room, c.playerId, { index: 1, optionIndex: 0 }, 31_000);
  submitAnswer(room, b.playerId, { index: 1, optionIndex: 3 }, 32_000);
  const r2 = closeQuestion(room);
  // Chen: 500 + round(500 * 9/10) = 950.
  assert.deepEqual(r2.shared.top10.map((r) => [r.nickname, r.score]), [['Chen', 950], ['Asha', 875], ['Ben', 625]]);
  assert.equal(r2.shared.isLast, true);
  const chen = r2.personal.find((p) => p.playerId === c.playerId).result;
  assert.deepEqual(chen, { correct: true, points: 950, answered: true, score: 950, rank: 1, of: 3 });
  const asha = r2.personal.find((p) => p.playerId === a.playerId).result;
  assert.equal(asha.answered, false);

  const over = finishQuiz(room, 40_000);
  assert.deepEqual(over.podium.map((p) => p.nickname), ['Chen', 'Asha', 'Ben']);
  assert.equal(room.phase, 'finished');
  deleteRoom(room.code);
});

test('ties share a rank (1, 2, 2, 4)', () => {
  const players = [
    { score: 900, joinedAt: 1 },
    { score: 500, joinedAt: 2 },
    { score: 500, joinedAt: 3 },
    { score: 100, joinedAt: 4 },
  ];
  assert.deepEqual(rankPlayers(players).map((p) => p.rank), [1, 2, 2, 4]);
});

test('rejoining with the same playerId keeps the player and score', () => {
  const { room, add } = makeRoom();
  const a = add('Asha');
  a.score = 700;
  const again = addOrRejoinPlayer(room, { playerId: a.playerId, socketId: 'new-socket' }, newQuizPlayer);
  assert.equal(again.rejoined, true);
  assert.equal(again.player.score, 700);
  assert.equal(again.player.socketId, 'new-socket');
  assert.equal(room.players.size, 1);
  deleteRoom(room.code);
});
