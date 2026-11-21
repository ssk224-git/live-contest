// A whole live contest over real sockets, with a fake judge (no Judge0 calls).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startSocketServer, hostToken, ask, waitFor, sleep } from './socketHelpers.js';
import { testDbUri } from './helpers.js';
import { createRoom, deleteRoom } from '../src/live/rooms.js';
import { setContestJudge } from '../src/live/contestSocket.js';
import { publicProblem } from '../src/live/contestGame.js';
import { Session } from '../src/models/Session.js';
import { Submission } from '../src/models/Submission.js';
import { sampleContestData } from '../scripts/sampleData.js';

let srv;
const hostId = new mongoose.Types.ObjectId().toString();

// Fake judge: code containing "GOOD" passes every test, "BAD" fails test 2, "SYNTAX" is a compile error.
setContestJudge(async ({ code, tests, showDetails }) => {
  await sleep(50);
  const verdictCode = code.includes('GOOD') ? 'AC' : code.includes('SYNTAX') ? 'CE' : 'WA';
  const names = { AC: 'Accepted', WA: 'Wrong Answer', CE: 'Compile Error' };
  return {
    verdict: names[verdictCode],
    verdictCode,
    passed: verdictCode === 'AC' ? tests.length : 1,
    total: tests.length,
    failedTest: verdictCode === 'AC' ? null : 2,
    timeMs: 12,
    message: verdictCode === 'CE' ? 'error: expected ;' : '',
    ...(showDetails ? { tests: tests.map((t) => ({ verdict: names[verdictCode], input: t.input, expected: t.output, stdout: 'x' })) } : {}),
  };
});

before(async () => {
  const uri = testDbUri();
  if (uri) await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  srv = await startSocketServer();
});

after(async () => {
  await srv.close();
  if (mongoose.connection.readyState === 1) {
    await Session.deleteMany({ owner: hostId });
    await Submission.deleteMany({ owner: hostId });
    await mongoose.disconnect();
  }
});

function contestRoom() {
  const contest = { _id: new mongoose.Types.ObjectId(), ...sampleContestData(), durationMin: 5 };
  return createRoom({
    kind: 'contest',
    hostUserId: hostId,
    title: contest.title,
    contest,
    publicProblems: contest.problems.map((p) => publicProblem(p, contest.languages)),
    endsAt: null,
    pending: 0,
    final: null,
    feed: [],
    recent: [],
    sessionId: null,
  });
}

test('host + 2 students: problems hidden until start, verdicts, live leaderboard, final save', async () => {
  const room = contestRoom();
  const host = await srv.bot();
  assert.equal((await ask(host, 'host:join', { code: room.code, token: hostToken(hostId) })).ok, true);

  const asha = await srv.bot();
  const ben = await srv.bot();
  const a = await ask(asha, 'player:join', { code: room.code, nickname: 'Asha' });
  const b = await ask(ben, 'player:join', { code: room.code, nickname: 'Ben' });
  assert.equal(a.state.problems, null, 'problems are secret before the start');
  assert.equal(a.state.problemCount, 2);

  // Code requests before the start are refused.
  assert.equal((await ask(asha, 'code:submit', { problemIndex: 0, language: 'cpp', code: 'GOOD' })).ok, false);

  const started = waitFor(asha, 'contest:started');
  assert.equal((await ask(host, 'contest:start')).ok, true);
  const s = await started;
  assert.equal(s.problems.length, 2);
  assert.equal(JSON.stringify(s).includes('referenceSolution'), false);
  assert.equal(JSON.stringify(s).includes('2000000000'), false, 'hidden test data never sent');

  // Run on examples shows details.
  const run = await ask(asha, 'code:run', { problemIndex: 0, language: 'python', code: 'BAD' });
  assert.equal(run.ok, true);
  assert.equal(run.result.tests[0].input, '2 3');

  // Ben: wrong answer, then accepted (one penalty).
  const benWrong = waitFor(ben, 'submission:result');
  assert.equal((await ask(ben, 'code:submit', { problemIndex: 0, language: 'java', code: 'BAD' })).ok, true);
  const r1 = await benWrong;
  assert.equal(r1.verdict, 'Wrong Answer');
  assert.equal(r1.failedTest, 2);
  assert.equal(JSON.stringify(r1).includes('2000000000'), false);

  assert.equal((await ask(ben, 'code:submit', { problemIndex: 0, language: 'java', code: 'GOOD' })).error, 'Wait a few seconds between submissions');
  await sleep(5100);
  const benAc = waitFor(ben, 'submission:result');
  await ask(ben, 'code:submit', { problemIndex: 0, language: 'java', code: 'GOOD' });
  const r2 = await benAc;
  assert.equal(r2.verdict, 'Accepted');
  assert.equal(r2.me.solved, 1);
  assert.equal(r2.me.penaltyMs, 5 * 60_000);

  // Asha: compile error (no penalty) then accepted on both problems.
  const ce = waitFor(asha, 'submission:result');
  await ask(asha, 'code:submit', { problemIndex: 1, language: 'cpp', code: 'SYNTAX' });
  assert.equal((await ce).verdict, 'Compile Error');
  await sleep(5100);
  const ac1 = waitFor(asha, 'submission:result');
  await ask(asha, 'code:submit', { problemIndex: 1, language: 'cpp', code: 'GOOD' });
  assert.equal((await ac1).me.penaltyMs, 0);
  await sleep(5100);
  const ac2 = waitFor(asha, 'submission:result');
  await ask(asha, 'code:submit', { problemIndex: 0, language: 'javascript', code: 'GOOD' });
  assert.equal((await ac2).me.solved, 2);

  // The live leaderboard (throttled to 1/s) shows Asha first.
  const board = await waitFor(ben, 'leaderboard', 3000);
  assert.deepEqual(board.rows.map((r) => [r.nickname, r.solved]), [['Asha', 2], ['Ben', 1]]);
  assert.equal(JSON.stringify(board).includes(a.playerId), false);

  // Host saw every submission live and can read the code.
  const news = host.log.filter(([e]) => e === 'submission:new');
  const updates = host.log.filter(([e]) => e === 'submission:update');
  assert.equal(news.length, 5);
  assert.equal(updates.length, 5);
  const code = await ask(host, 'host:submission-code', { id: news[0][1].id });
  assert.equal(code.code, 'BAD');
  // Students cannot read others' code.
  const peek = await ask(asha, 'host:submission-code', { id: news[0][1].id });
  assert.equal(peek.ok, false);
  assert.equal(peek.code, undefined);

  // End: final standings and one saved session.
  const over = waitFor(ben, 'contest:over', 5000);
  await ask(host, 'contest:end');
  const final = await over;
  assert.equal(final.podium[0].nickname, 'Asha');
  if (mongoose.connection.readyState === 1) {
    const saved = await waitFor(host, 'session:saved', 10_000).catch(() => host.log.find(([e]) => e === 'session:saved')?.[1]);
    const doc = await Session.findById(saved.sessionId).lean();
    assert.equal(doc.kind, 'contest');
    assert.deepEqual(doc.players.map((p) => [p.nickname, p.score, p.rank]), [['Asha', 2, 1], ['Ben', 1, 2]]);
    assert.equal(await Submission.countDocuments({ owner: hostId }), 5);
  }
  deleteRoom(room.code);
});
