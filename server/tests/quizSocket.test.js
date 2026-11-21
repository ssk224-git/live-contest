// A whole live quiz over real sockets: a host and 3 student bots.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startSocketServer, hostToken, ask, waitFor, sleep } from './socketHelpers.js';
import { testDbUri } from './helpers.js';
import { createRoom, getRoom, deleteRoom } from '../src/live/rooms.js';
import { newQuizRoomFields } from '../src/live/quizSocket.js';
import { Session } from '../src/models/Session.js';

let srv;
const hostId = new mongoose.Types.ObjectId().toString();

before(async () => {
  const uri = testDbUri();
  if (uri) await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  srv = await startSocketServer();
});

after(async () => {
  await srv.close();
  if (mongoose.connection.readyState === 1) {
    await Session.deleteMany({ owner: hostId });
    await mongoose.disconnect();
  }
});

const quiz = {
  _id: new mongoose.Types.ObjectId(),
  questions: [
    { text: 'Capital of France?', options: ['Rome', 'Paris', 'Oslo', 'Bern'], correctIndex: 1, timeLimitSec: 5 },
    { text: 'Largest planet?', options: ['Jupiter', 'Mars', 'Venus', 'Earth'], correctIndex: 0, timeLimitSec: 5 },
  ],
};

test('host + 3 students play a full quiz; answers stay secret until the reveal', async () => {
  const room = createRoom({ kind: 'quiz', hostUserId: hostId, title: 'Socket quiz', ...newQuizRoomFields(quiz) });
  const host = await srv.bot();
  const joined = await ask(host, 'host:join', { code: room.code, token: hostToken(hostId) });
  assert.equal(joined.ok, true);

  // Someone else's token cannot host this room.
  const intruder = await srv.bot();
  assert.equal((await ask(intruder, 'host:join', { code: room.code, token: hostToken('someone-else') })).ok, false);

  const students = [];
  for (const name of ['Asha', 'Ben', 'Asha']) {
    const s = await srv.bot();
    const r = await ask(s, 'player:join', { code: room.code, nickname: name });
    assert.equal(r.ok, true);
    s.me = r;
    students.push(s);
  }
  assert.equal(students[2].me.nickname, 'Asha (2)', 'duplicate nickname gets a number');
  assert.equal((await ask(await srv.bot(), 'player:join', { code: 'ZZZZZZ', nickname: 'X' })).ok, false, 'wrong code');

  const lobby = await waitFor(host, 'lobby:update');
  assert.equal(lobby.count, 3);

  // Question 1.
  const q1Promise = waitFor(students[0], 'question:start');
  assert.equal((await ask(host, 'quiz:start')).ok, true);
  const q1 = await q1Promise;
  assert.equal(q1.text, 'Capital of France?');
  assert.equal('correctIndex' in q1, false);

  assert.equal((await ask(students[0], 'answer:submit', { index: 0, optionIndex: 1 })).accepted, true);
  assert.equal((await ask(students[0], 'answer:submit', { index: 0, optionIndex: 1 })).accepted, false, 'duplicate');
  assert.equal((await ask(students[1], 'answer:submit', { index: 0, optionIndex: 3 })).accepted, true);
  const endPromise = waitFor(students[0], 'question:end');
  const resultPromise = waitFor(students[0], 'player:result');
  await ask(students[2], 'answer:submit', { index: 0, optionIndex: 1 }); // everyone answered -> closes early
  const end1 = await endPromise;
  assert.equal(end1.correctIndex, 1);
  assert.deepEqual(end1.counts, [0, 2, 0, 1]);
  const mine = await resultPromise;
  assert.equal(mine.correct, true);
  assert.ok(mine.points > 900);

  // Late answer after the reveal is rejected.
  assert.equal((await ask(students[1], 'answer:submit', { index: 0, optionIndex: 1 })).reason, 'not-open');

  // Nothing a student received before the reveal contained the answer key.
  for (const s of students) {
    const beforeReveal = s.log.slice(0, s.log.findIndex(([e]) => e === 'question:end'));
    assert.equal(JSON.stringify(beforeReveal).includes('correctIndex'), false);
  }

  // Refresh: student 1 rejoins with their playerId mid-game and keeps their score.
  const ben = await srv.bot();
  const back = await ask(ben, 'player:join', { code: room.code, playerId: students[1].me.playerId });
  assert.equal(back.rejoined, true);
  assert.equal(back.nickname, 'Ben');
  assert.equal(back.state.phase, 'reveal');

  // Question 2: nobody answers in time -> the server timer closes it.
  const q2Promise = waitFor(ben, 'question:start');
  await ask(host, 'quiz:next');
  const q2 = await q2Promise;
  assert.equal(q2.index, 1);
  await sleep(200);
  const midState = await ask(await srv.bot(), 'player:join', { code: room.code, playerId: students[0].me.playerId });
  assert.equal(midState.state.phase, 'question');
  assert.ok(midState.state.question.endsAt > Date.now(), 'rejoin mid-question gets the real end time');

  const timerEnd = await waitFor(ben, 'question:end', 7000);
  assert.equal(timerEnd.answered, 0);
  assert.equal(timerEnd.isLast, true);

  const overPromise = waitFor(ben, 'game:over');
  await ask(host, 'quiz:next');
  const over = await overPromise;
  assert.equal(over.podium[0].nickname, 'Asha');
  assert.equal(getRoom(room.code).phase, 'finished');

  if (mongoose.connection.readyState === 1) {
    // The save finishes before quiz:next's ack, so the message may already be in the log.
    const logged = host.log.find(([e]) => e === 'session:saved');
    const saved = logged ? logged[1] : await waitFor(host, 'session:saved', 10_000);
    assert.ok(saved.sessionId);
    const doc = await Session.findById(saved.sessionId).lean();
    assert.equal(doc.players.length, 3);
    assert.equal(doc.players[0].answers.length, 2);
  }
  deleteRoom(room.code);
});
