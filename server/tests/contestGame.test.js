// Unit tests for contest ranking (LeetCode rules), checked against a hand calculation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newContestPlayer, applyVerdict, rankContest, leaderboard, publicProblem } from '../src/live/contestGame.js';

const MIN = 60_000;
const room = {
  contest: { penaltyMin: 5, problems: [{ title: 'A' }, { title: 'B' }] },
  players: new Map(),
};
function player(name, joinedAt) {
  const p = { publicId: name, playerId: `secret-${name}`, nickname: name, joinedAt, ...newContestPlayer(room) };
  room.players.set(p.playerId, p);
  return p;
}

test('LeetCode ranking: solved first, then finish time with penalties', () => {
  const asha = player('Asha', 1);
  const ben = player('Ben', 2);
  const chen = player('Chen', 3);
  const dev = player('Dev', 4);

  // Asha: A wrong at 2 min, A accepted at 10 min, B accepted at 20 min -> 2 solved, finish 20 + 5 = 25 min.
  applyVerdict(room, asha, 0, 'WA', 2 * MIN);
  applyVerdict(room, asha, 0, 'AC', 10 * MIN);
  applyVerdict(room, asha, 1, 'AC', 20 * MIN);
  // Ben: A at 8 min, B at 22 min, no wrong -> 2 solved, finish 22 min (beats Asha's 25).
  applyVerdict(room, ben, 0, 'AC', 8 * MIN);
  applyVerdict(room, ben, 1, 'AC', 22 * MIN);
  // Chen: compile error (no penalty), then A at 3 min; 3 wrong on B (unsolved: no penalty) -> 1 solved, finish 3 min.
  applyVerdict(room, chen, 0, 'CE', 1 * MIN);
  applyVerdict(room, chen, 0, 'AC', 3 * MIN);
  applyVerdict(room, chen, 1, 'WA', 4 * MIN);
  applyVerdict(room, chen, 1, 'TLE', 5 * MIN);
  applyVerdict(room, chen, 1, 'RE', 6 * MIN);
  // Dev: nothing solved.
  applyVerdict(room, dev, 0, 'WA', 1 * MIN);

  assert.equal(asha.finishMs, 25 * MIN);
  assert.equal(asha.penaltyMs, 5 * MIN);
  assert.equal(ben.finishMs, 22 * MIN);
  assert.equal(chen.finishMs, 3 * MIN);
  assert.equal(chen.penaltyMs, 0, 'wrong answers on an unsolved problem and compile errors cost nothing');

  const ranked = rankContest(room.players.values());
  assert.deepEqual(ranked.map((p) => [p.nickname, p.rank]), [['Ben', 1], ['Asha', 2], ['Chen', 3], ['Dev', 4]]);

  // Submitting again after solving changes nothing.
  assert.equal(applyVerdict(room, ben, 0, 'WA', 30 * MIN), false);
  assert.equal(ben.finishMs, 22 * MIN);
  assert.equal(ben.problems[0].attempts, 2);

  const board = leaderboard(room);
  assert.equal(board.total, 4);
  assert.deepEqual(board.stats, [{ solved: 3, tried: 4 }, { solved: 2, tried: 3 }]);
  assert.equal(JSON.stringify(board).includes('secret-'), false, 'no secret playerId in the leaderboard');
});

test('equal solved and finish time share a rank', () => {
  const players = [
    { solved: 1, finishMs: 100, joinedAt: 1 },
    { solved: 1, finishMs: 100, joinedAt: 2 },
    { solved: 0, finishMs: 0, joinedAt: 3 },
  ];
  assert.deepEqual(rankContest(players).map((p) => p.rank), [1, 1, 3]);
});

test('publicProblem never includes hidden tests or the reference solution', () => {
  const p = publicProblem({
    title: 'T',
    statement: 'S',
    inputFormat: '',
    outputFormat: '',
    constraints: '',
    examples: [{ input: '1', output: '2', explanation: '' }],
    tests: [{ input: 'HIDDEN-IN', output: 'HIDDEN-OUT' }],
    referenceSolution: { language: 'python', code: 'SECRET-SOLUTION' },
    timeLimitSec: 2,
  });
  const json = JSON.stringify(p);
  assert.equal(json.includes('HIDDEN'), false);
  assert.equal(json.includes('SECRET'), false);
  assert.equal(p.testCount, 1);
  assert.equal(p.timeLimits.python, 7.5);
});
