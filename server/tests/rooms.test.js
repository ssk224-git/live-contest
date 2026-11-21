// Unit tests for room codes, nickname rules and cleanup of old rooms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomCode, createRoom, getRoom, cleanNickname, rooms } from '../src/live/rooms.js';
import { sweepRooms } from '../src/live/sockets.js';

test('room codes are 6 easy-to-read characters', () => {
  for (let i = 0; i < 200; i += 1) assert.match(randomCode(), /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
});

test('nickname rules', () => {
  assert.deepEqual(cleanNickname('  Riya  '), { name: 'Riya' });
  assert.deepEqual(cleanNickname('a\u0000b   c'), { name: 'ab c' });
  assert.ok(cleanNickname('').error);
  assert.ok(cleanNickname('x'.repeat(21)).error);
});

test('sweepRooms deletes finished and abandoned rooms but keeps running contests', () => {
  const now = Date.now();
  const finished = createRoom({ kind: 'quiz', hostUserId: 'u', title: 'a' });
  finished.phase = 'finished';
  finished.endedAt = now - 11 * 60 * 1000;
  const abandoned = createRoom({ kind: 'quiz', hostUserId: 'u', title: 'b' });
  abandoned.hostLeftAt = now - 31 * 60 * 1000;
  const running = createRoom({ kind: 'contest', hostUserId: 'u', title: 'c' });
  running.phase = 'running';
  running.hostLeftAt = now - 31 * 60 * 1000;
  const fresh = createRoom({ kind: 'quiz', hostUserId: 'u', title: 'd' });

  sweepRooms(now);
  assert.equal(getRoom(finished.code), undefined);
  assert.equal(getRoom(abandoned.code), undefined);
  assert.ok(getRoom(running.code));
  assert.ok(getRoom(fresh.code));
  rooms.clear();
});
