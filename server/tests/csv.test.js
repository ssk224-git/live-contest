// Unit tests for the CSV export (escaping commas/quotes and blocking spreadsheet formulas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, sessionCsv, formatDuration } from '../src/live/csv.js';

test('csvCell escapes commas, quotes and newlines', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('Das, Ravi'), '"Das, Ravi"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('two\nlines'), '"two\nlines"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(0), '0');
});

test('csvCell stops formula injection', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('@sum'), "'@sum");
});

test('quiz CSV: one row per student, one column per question', () => {
  const csv = sessionCsv({
    kind: 'quiz',
    questions: [{ text: 'a' }, { text: 'b' }],
    players: [
      { rank: 1, nickname: 'Das, Ravi', score: 950, answers: [{ optionIndex: 1, correct: true }, { optionIndex: null }] },
      { rank: 2, nickname: 'Ben', score: 0, answers: [{ optionIndex: 2, correct: false }] },
    ],
  });
  const lines = csv.replace('﻿', '').trim().split('\r\n');
  assert.equal(lines[0], 'Rank,Nickname,Score,Correct,Q1,Q2');
  assert.equal(lines[1], '1,"Das, Ravi",950,1,correct,no answer');
  assert.equal(lines[2], '2,Ben,0,0,wrong,no answer');
  assert.ok(csv.startsWith('﻿'), 'BOM so Excel reads UTF-8');
});

test('contest CSV: solved times, wrong counts and penalty', () => {
  const csv = sessionCsv({
    kind: 'contest',
    problems: [{ title: 'Sum' }, { title: 'Max, Min' }],
    players: [
      { rank: 1, nickname: 'Asha', score: 2, finishMs: 754000, penaltyMs: 300000, problems: [{ solved: true, wrong: 1, solvedAtMs: 120000, attempts: 2 }, { solved: true, wrong: 0, solvedAtMs: 454000, attempts: 1 }] },
      { rank: 2, nickname: 'Ben', score: 0, finishMs: 0, penaltyMs: 0, problems: [{ solved: false, wrong: 3, attempts: 3 }, { attempts: 0 }] },
    ],
  });
  const lines = csv.replace('﻿', '').trim().split('\r\n');
  assert.equal(lines[0], 'Rank,Nickname,Solved,Finish time (m:ss),Penalty (m:ss),A: Sum,"B: Max, Min"');
  assert.equal(lines[1], '1,Asha,2,12:34,5:00,solved at 2:00 (+1 wrong),solved at 7:34');
  assert.equal(lines[2], '2,Ben,0,,0:00,3 wrong,not tried');
  assert.equal(formatDuration(5000), '0:05');
});
