// The rules of a live coding contest (LeetCode style), as plain functions so they are easy to test.
//   1. More problems solved ranks higher.
//   2. Ties: lower "finish time" ranks higher.
//      finish time = time of the last Accepted submission (from the start)
//                  + penalty minutes x wrong submissions on the problems you SOLVED.
//   3. Wrong submissions on unsolved problems, compile errors, judge errors and
//      submissions after a problem is solved change nothing.
import { timeLimitFor, LANGUAGE_KEYS } from '../judge/languages.js';

// Fields every contest player starts with (one entry per problem).
export const newContestPlayer = (room) => ({
  problems: room.contest.problems.map(() => ({ solved: false, wrong: 0, attempts: 0, solvedAtMs: null, lastVerdict: null })),
  solved: 0,
  penaltyMs: 0,
  finishMs: 0,
  busy: false, // true while one of their Run/Submit jobs is being judged
  lastSubmitAt: 0,
  lastRunAt: 0,
  submissions: [], // this student's own recent submissions (for their screen)
});

// What students may see of a problem: never the hidden tests or the reference solution.
export function publicProblem(p, languages = LANGUAGE_KEYS) {
  return {
    title: p.title,
    statement: p.statement,
    inputFormat: p.inputFormat,
    outputFormat: p.outputFormat,
    constraints: p.constraints,
    examples: p.examples.map((e) => ({ input: e.input, output: e.output, explanation: e.explanation || '' })),
    timeLimits: Object.fromEntries(languages.map((l) => [l, timeLimitFor(l, p.timeLimitSec)])),
    testCount: p.tests.length,
  };
}

// Recomputes a player's solved count, penalty and finish time from their per-problem results.
export function recompute(player, penaltyMinutes) {
  const solved = player.problems.filter((p) => p.solved);
  player.solved = solved.length;
  player.penaltyMs = solved.reduce((sum, p) => sum + p.wrong, 0) * penaltyMinutes * 60_000;
  player.finishMs = solved.length ? Math.max(...solved.map((p) => p.solvedAtMs)) + player.penaltyMs : 0;
}

// Applies one judged submission. atMs = when it ARRIVED (from the contest start), not when judging ended.
// Returns true if the standings changed.
export function applyVerdict(room, player, problemIndex, verdictCode, atMs) {
  const state = player.problems[problemIndex];
  state.attempts += 1;
  state.lastVerdict = verdictCode;
  if (state.solved) return false; // already solved: later submissions change nothing
  if (verdictCode === 'CE' || verdictCode === 'JE') return false; // no penalty for these
  if (verdictCode === 'AC') {
    state.solved = true;
    state.solvedAtMs = atMs;
  } else {
    state.wrong += 1; // only matters if the problem is solved later
  }
  recompute(player, room.contest.penaltyMin);
  return true;
}

// Sorts by (solved desc, finish time asc). Equal solved + finish time share a rank.
export function rankContest(players) {
  const sorted = [...players].sort((a, b) => b.solved - a.solved || a.finishMs - b.finishMs || a.joinedAt - b.joinedAt);
  let rank = 0;
  let prev = null;
  sorted.forEach((p, i) => {
    const key = `${p.solved}:${p.finishMs}`;
    if (key !== prev) {
      rank = i + 1;
      prev = key;
    }
    p.rank = rank;
  });
  return sorted;
}

// One leaderboard row (safe to broadcast: no secret playerId, no code).
export const standingRow = (p) => ({
  publicId: p.publicId,
  nickname: p.nickname,
  rank: p.rank,
  solved: p.solved,
  finishMs: p.finishMs,
  penaltyMs: p.penaltyMs,
  problems: p.problems.map((s) => ({ solved: s.solved, wrong: s.wrong, tried: s.attempts > 0, solvedAtMs: s.solvedAtMs })),
});

// The leaderboard message: top 50 rows plus how many solved / tried each problem.
export function leaderboard(room, limit = 50) {
  const ranked = rankContest(room.players.values());
  const stats = room.contest.problems.map((_, i) => ({
    solved: ranked.filter((p) => p.problems[i].solved).length,
    tried: ranked.filter((p) => p.problems[i].attempts > 0).length,
  }));
  return { rows: ranked.slice(0, limit).map(standingRow), total: ranked.length, stats };
}

// The MongoDB Session document for a finished contest (written once).
export function contestSessionDoc(room) {
  const ranked = rankContest(room.players.values());
  return {
    kind: 'contest',
    owner: room.hostUserId,
    title: room.title,
    code: room.code,
    contest: room.contest._id,
    startedAt: room.startedAt ? new Date(room.startedAt) : null,
    endedAt: new Date(room.endedAt || Date.now()),
    problems: room.contest.problems.map((p) => ({ title: p.title })),
    penaltyMin: room.contest.penaltyMin,
    players: ranked.map((p) => ({
      nickname: p.nickname,
      rank: p.rank,
      score: p.solved,
      finishMs: p.finishMs,
      penaltyMs: p.penaltyMs,
      problems: p.problems.map((s) => ({ solved: s.solved, wrong: s.wrong, solvedAtMs: s.solvedAtMs, attempts: s.attempts })),
    })),
  };
}
