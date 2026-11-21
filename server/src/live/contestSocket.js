// Socket events for a live coding contest: start/end, Run (examples), Submit (hidden tests),
// a live leaderboard and a live submissions feed for the host.
import { randomUUID } from 'node:crypto';
import { Contest } from '../models/Contest.js';
import { Session } from '../models/Session.js';
import { Submission } from '../models/Submission.js';
import { findOwned } from '../utils/findOwned.js';
import { AppError } from '../utils/AppError.js';
import { createRoom, onlineCount } from './rooms.js';
import { judgeCode, JudgeUnavailableError, MAX_CODE_BYTES, VERDICTS } from '../judge/judge.js';
import { newContestPlayer, publicProblem, applyVerdict, rankContest, leaderboard, contestSessionDoc } from './contestGame.js';

let io; // the Socket.IO server
let judge = judgeCode; // swapped for a fake in tests
export const setContestJudge = (fn) => {
  judge = fn;
};

const RUN_COOLDOWN_MS = 3000;
const SUBMIT_COOLDOWN_MS = 5000;
const END_GRACE_MS = 2000; // accept a submission that arrives just after the buzzer (network delay)
const FEED_SIZE = 300; // submissions the host's feed keeps in memory

export const makeContestPlayer = newContestPlayer;

// Opens a live room for one of the host's contests.
export async function createContestRoom(contestId, userId) {
  const contest = await findOwned(Contest, contestId, userId, 'Contest');
  if (!contest.problems.length) throw new AppError(400, 'This contest has no problems');
  if (contest.problems.some((p) => !p.tests.length)) throw new AppError(400, 'Every problem needs at least one hidden test');
  const data = contest.toObject();
  return createRoom({
    kind: 'contest',
    hostUserId: userId,
    title: data.title,
    contest: data, // full copy, kept on the server only
    publicProblems: data.problems.map((p) => publicProblem(p, data.languages)),
    endsAt: null,
    pending: 0, // submissions still being judged
    final: null, // final standings once finished
    feed: [], // recent submissions, newest last (includes code: host only)
    recent: [],
    sessionId: null,
    hostUpdateTimer: null,
    boardTimer: null,
  });
}

// ---------- State snapshots (first join and after a refresh) ----------

const feedItem = (s) => ({
  id: s.id,
  publicId: s.publicId,
  nickname: s.nickname,
  problemIndex: s.problemIndex,
  language: s.language,
  verdict: s.verdict,
  passed: s.passed,
  total: s.total,
  failedTest: s.failedTest,
  timeMs: s.timeMs,
  atMs: s.atMs,
});

export function contestHostState(room) {
  return {
    kind: 'contest',
    code: room.code,
    title: room.title,
    phase: room.phase,
    count: onlineCount(room),
    recent: room.recent,
    durationMin: room.contest.durationMin,
    penaltyMin: room.contest.penaltyMin,
    languages: room.contest.languages,
    problems: room.publicProblems,
    endsAt: room.endsAt,
    board: leaderboard(room),
    feed: room.feed.slice(-100).map(feedItem),
    sessionId: room.sessionId,
    final: room.final,
  };
}

export function contestPlayerState(room, player) {
  const started = room.phase !== 'lobby';
  return {
    phase: room.phase,
    title: room.title,
    durationMin: room.contest.durationMin,
    penaltyMin: room.contest.penaltyMin,
    languages: room.contest.languages,
    problems: started ? room.publicProblems : null, // problems stay secret until the start
    problemCount: room.publicProblems.length,
    endsAt: room.endsAt,
    me: { problems: player.problems, solved: player.solved, finishMs: player.finishMs, penaltyMs: player.penaltyMs, rank: player.rank ?? null },
    submissions: player.submissions,
    board: started ? leaderboard(room) : null,
    final: room.final,
  };
}

// ---------- Throttled broadcasts ----------

// Host lobby summary at most twice a second.
function scheduleHostUpdate(room) {
  if (room.hostUpdateTimer) return;
  room.hostUpdateTimer = setTimeout(() => {
    room.hostUpdateTimer = null;
    io.to(`${room.code}:host`).emit('lobby:update', { count: onlineCount(room), total: room.players.size, recent: room.recent });
  }, 500);
}

// Leaderboard to everyone at most once a second (never one broadcast per submission).
function scheduleBoard(room) {
  if (room.boardTimer) return;
  room.boardTimer = setTimeout(() => {
    room.boardTimer = null;
    io.to(room.code).emit('leaderboard', leaderboard(room));
  }, 1000);
}

export function onContestPlayerJoined(room, player, rejoined) {
  if (!rejoined) {
    room.recent = [...room.recent, player.nickname].slice(-12);
    if (room.phase !== 'lobby') scheduleBoard(room);
  }
  scheduleHostUpdate(room);
}

export function onContestPlayerLeft(room) {
  scheduleHostUpdate(room);
}

// ---------- Start / end ----------

function startContest(room) {
  const now = Date.now();
  room.phase = 'running';
  room.startedAt = now;
  room.endsAt = now + room.contest.durationMin * 60_000;
  clearTimeout(room.timer);
  room.timer = setTimeout(() => endContest(room), room.endsAt - now);
  rankContest(room.players.values());
  io.to(room.code).emit('contest:started', {
    endsAt: room.endsAt,
    serverNow: now,
    problems: room.publicProblems,
    board: leaderboard(room),
  });
}

// Ends the contest. Submissions that arrived before the end are still judged and counted:
// we wait for them (up to 60 s) before the final standings are sent and saved.
async function endContest(room) {
  if (room.phase === 'finished') return;
  clearTimeout(room.timer);
  room.phase = 'finished';
  room.endedAt = Date.now();
  io.to(room.code).emit('contest:ended', { pending: room.pending });
  const waitStart = Date.now();
  while (room.pending > 0 && Date.now() - waitStart < 60_000) await new Promise((resolve) => setTimeout(resolve, 500));

  const board = leaderboard(room, 50);
  room.final = { board, podium: board.rows.slice(0, 3) };
  io.to(room.code).emit('contest:over', room.final);
  try {
    const doc = await Session.create(contestSessionDoc(room));
    room.sessionId = doc._id.toString();
    io.to(`${room.code}:host`).emit('session:saved', { sessionId: room.sessionId });
  } catch (err) {
    console.error(`[contest] could not save session ${room.code}:`, err.message);
    io.to(`${room.code}:host`).emit('session:saved', { error: 'Results could not be saved to the database' });
  }
}

// ---------- Run / Submit ----------

// Checks a Run/Submit request. Returns { problem, error }.
function checkCodeRequest(room, player, payload, now) {
  if (room.phase !== 'running' || now > room.endsAt + END_GRACE_MS) return { error: 'The contest is not running' };
  const index = payload?.problemIndex;
  const problem = Number.isInteger(index) ? room.contest.problems[index] : null;
  if (!problem) return { error: 'Unknown problem' };
  if (!room.contest.languages.includes(payload?.language)) return { error: 'That language is not allowed in this contest' };
  const code = String(payload?.code ?? '');
  if (!code.trim()) return { error: 'Write some code first' };
  if (Buffer.byteLength(code) > MAX_CODE_BYTES) return { error: 'Your code is too long (64 KB max)' };
  if (player.busy) return { error: 'Your previous run is still being judged' };
  return { problem };
}

// Runs the student's code on the problem's PUBLIC examples (or on their own custom input).
async function handleRun(room, player, socket, payload) {
  const now = Date.now();
  const { problem, error } = checkCodeRequest(room, player, payload, now);
  if (error) return { ok: false, error };
  if (now - player.lastRunAt < RUN_COOLDOWN_MS) return { ok: false, error: 'Wait a few seconds between runs' };
  player.lastRunAt = now;
  player.busy = true;

  const custom = typeof payload.customInput === 'string';
  const tests = custom ? [{ input: payload.customInput.slice(0, 10_000), output: '' }] : problem.examples;
  try {
    const result = await judge(
      { language: payload.language, code: payload.code, tests, timeLimitSec: problem.timeLimitSec, showDetails: true },
      { onQueued: (position) => position > 0 && socket.emit('judge:queued', { position }) },
    );
    return { ok: true, custom, result };
  } catch (err) {
    if (err instanceof JudgeUnavailableError) return { ok: false, error: err.message };
    console.error('[contest] run failed:', err);
    return { ok: false, error: 'Running your code failed. Try again.' };
  } finally {
    player.busy = false;
  }
}

// Judges the student's code on the HIDDEN tests. Replies right away; the verdict comes later
// as "submission:result" (and the host gets "submission:new" / "submission:update").
function handleSubmit(room, player, socket, payload) {
  const now = Date.now();
  const { problem, error } = checkCodeRequest(room, player, payload, now);
  if (error) return { ok: false, error };
  if (now - player.lastSubmitAt < SUBMIT_COOLDOWN_MS) return { ok: false, error: 'Wait a few seconds between submissions' };
  player.lastSubmitAt = now;
  player.busy = true;
  room.pending += 1;

  const sub = {
    id: randomUUID().slice(0, 12),
    publicId: player.publicId,
    nickname: player.nickname,
    problemIndex: payload.problemIndex,
    language: payload.language,
    code: payload.code,
    verdict: 'Judging',
    passed: 0,
    total: problem.tests.length,
    failedTest: null,
    timeMs: null,
    atMs: Math.min(now, room.endsAt) - room.startedAt, // arrival time counts, not judging time
  };
  room.feed.push(sub);
  if (room.feed.length > FEED_SIZE) room.feed.shift();
  io.to(`${room.code}:host`).emit('submission:new', feedItem(sub));

  (async () => {
    let result;
    try {
      result = await judge(
        { language: sub.language, code: sub.code, tests: problem.tests, timeLimitSec: problem.timeLimitSec, showDetails: false },
        { onQueued: (position) => position > 0 && socket.emit('judge:queued', { position }) },
      );
    } catch (err) {
      if (!(err instanceof JudgeUnavailableError)) console.error('[contest] submit failed:', err);
      result = { verdict: VERDICTS.JE, verdictCode: 'JE', passed: 0, total: sub.total, failedTest: null, timeMs: null, message: err.message };
    } finally {
      player.busy = false;
    }

    Object.assign(sub, { verdict: result.verdict, passed: result.passed, failedTest: result.failedTest, timeMs: result.timeMs });
    const changed = applyVerdict(room, player, sub.problemIndex, result.verdictCode, sub.atMs);
    if (changed) rankContest(room.players.values());
    const mine = { ...feedItem(sub), message: result.message || '' };
    player.submissions = [mine, ...player.submissions].slice(0, 30);

    const target = player.connected ? player.socketId : null;
    if (target) {
      io.to(target).emit('submission:result', {
        ...mine,
        me: { problems: player.problems, solved: player.solved, finishMs: player.finishMs, penaltyMs: player.penaltyMs, rank: player.rank },
      });
    }
    io.to(`${room.code}:host`).emit('submission:update', feedItem(sub));
    if (changed || result.verdictCode !== 'JE') scheduleBoard(room);
    room.pending -= 1;

    Submission.create({
      sessionCode: room.code,
      contest: room.contest._id,
      owner: room.hostUserId,
      publicId: sub.publicId,
      nickname: sub.nickname,
      problemIndex: sub.problemIndex,
      language: sub.language,
      code: sub.code,
      verdict: sub.verdict,
      passed: sub.passed,
      total: sub.total,
      failedTest: sub.failedTest,
      timeMs: sub.timeMs,
      atMs: sub.atMs,
    }).catch((err) => console.warn('[contest] could not save submission:', err.message));
  })();

  return { ok: true, submissionId: sub.id };
}

// ---------- Event wiring ----------

export function registerContestHandlers(server, socket, { hostRoom, playerRoom }) {
  io = server;

  socket.on('contest:start', (payload, ack) => {
    const room = hostRoom(socket, 'contest');
    if (!room) return reply(ack, { ok: false, error: 'Not the host of a contest' });
    if (room.phase !== 'lobby') return reply(ack, { ok: false, error: 'The contest has already started' });
    startContest(room);
    reply(ack, { ok: true });
  });

  socket.on('contest:end', (payload, ack) => {
    const room = hostRoom(socket, 'contest');
    if (!room || room.phase !== 'running') return reply(ack, { ok: false, error: 'The contest is not running' });
    endContest(room); // not awaited: it may wait for submissions still being judged
    reply(ack, { ok: true });
  });

  // Host: read one submission's code.
  socket.on('host:submission-code', (payload, ack) => {
    const room = hostRoom(socket, 'contest');
    const sub = room?.feed.find((s) => s.id === payload?.id);
    if (!sub) return reply(ack, { ok: false, error: 'Submission not found (only the latest ones are kept in memory)' });
    reply(ack, { ok: true, code: sub.code, language: sub.language, nickname: sub.nickname, problemIndex: sub.problemIndex, verdict: sub.verdict });
  });

  socket.on('code:run', async (payload, ack) => {
    const found = playerRoom(socket, 'contest');
    if (!found) return reply(ack, { ok: false, error: 'Not in a contest' });
    reply(ack, await handleRun(found.room, found.player, socket, payload));
  });

  socket.on('code:submit', (payload, ack) => {
    const found = playerRoom(socket, 'contest');
    if (!found) return reply(ack, { ok: false, error: 'Not in a contest' });
    reply(ack, handleSubmit(found.room, found.player, socket, payload));
  });
}

function reply(ack, value) {
  if (typeof ack === 'function') ack(value);
}
