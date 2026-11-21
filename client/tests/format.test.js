// Unit tests for the client's pure helpers. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMs, formatClock, LETTER } from '../src/lib/format.js';
import { LANGUAGES, LANGUAGE_KEYS } from '../src/lib/languages.js';

test('formatMs shows elapsed contest time', () => {
  assert.equal(formatMs(0), '0:00');
  assert.equal(formatMs(754000), '12:34');
  assert.equal(formatMs(3_725_000), '1:02:05');
  assert.equal(formatMs(null), '');
});

test('formatClock rounds up and never goes negative', () => {
  assert.equal(formatClock(1), '0:01');
  assert.equal(formatClock(59_001), '1:00');
  assert.equal(formatClock(-500), '0:00');
  assert.equal(formatClock(30 * 60_000), '30:00');
});

test('problem letters and starter code for every language', () => {
  assert.deepEqual([0, 1, 2, 3].map(LETTER), ['A', 'B', 'C', 'D']);
  assert.deepEqual(LANGUAGE_KEYS, ['cpp', 'python', 'javascript', 'java']);
  assert.match(LANGUAGES.java.starter, /public class Main/);
  for (const key of LANGUAGE_KEYS) assert.ok(LANGUAGES[key].starter.length > 10);
});
