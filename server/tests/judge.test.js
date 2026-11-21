// Unit tests for the judge (fake Judge0 runner, no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeCode } from '../src/judge/judge.js';
import { outputsMatch } from '../src/judge/compare.js';
import { createQueue } from '../src/judge/queue.js';
import { timeLimitFor } from '../src/judge/languages.js';

const tests = [
  { input: 'SECRET-INPUT-1', output: '5' },
  { input: 'SECRET-INPUT-2', output: '7' },
  { input: 'SECRET-INPUT-3', output: '9' },
];
const ok = (stdout) => ({ statusId: 3, status: 'Accepted', stdout, stderr: '', compileOutput: '', message: '', timeMs: 10, memoryKb: 900 });
const fakeRunner = (results) => async () => results;
const noQueue = { add: (fn) => fn() };

test('outputsMatch ignores extra whitespace but not different words', () => {
  assert.equal(outputsMatch('1 2\n3', '1   2\r\n3\n\n'), true);
  assert.equal(outputsMatch('1 2 3', '1 2'), false);
  assert.equal(outputsMatch('YES', 'yes'), false);
});

test('all tests pass -> Accepted', async () => {
  const r = await judgeCode({ language: 'cpp', code: 'x', tests }, { runner: fakeRunner([ok('5'), ok('7\n'), ok(' 9 ')]), queue: noQueue });
  assert.equal(r.verdict, 'Accepted');
  assert.equal(r.passed, 3);
  assert.equal(r.failedTest, null);
});

test('first failing test decides the verdict, and Submit leaks nothing hidden', async () => {
  const leaky = { statusId: 11, status: 'Runtime Error (NZEC)', stdout: 'SECRET-INPUT-3', stderr: 'echo SECRET-INPUT-3', compileOutput: '', message: 'Exited with error status 1', timeMs: 5 };
  const r = await judgeCode({ language: 'python', code: 'x', tests }, { runner: fakeRunner([ok('5'), ok('8'), leaky]), queue: noQueue });
  assert.equal(r.verdict, 'Wrong Answer');
  assert.equal(r.failedTest, 2);
  assert.equal(r.passed, 1);
  const r2 = await judgeCode({ language: 'python', code: 'x', tests }, { runner: fakeRunner([ok('5'), ok('7'), leaky]), queue: noQueue });
  assert.equal(r2.verdict, 'Runtime Error');
  assert.equal(r2.failedTest, 3);
  assert.equal(JSON.stringify(r2).includes('SECRET'), false, 'no hidden input, output or stderr in a Submit result');
  assert.equal(r2.tests, undefined);
});

test('Run on examples shows input, expected and actual output', async () => {
  const r = await judgeCode({ language: 'cpp', code: 'x', tests: tests.slice(0, 1), showDetails: true }, { runner: fakeRunner([ok('6')]), queue: noQueue });
  assert.equal(r.verdict, 'Wrong Answer');
  assert.deepEqual(r.tests[0].input, 'SECRET-INPUT-1');
  assert.deepEqual(r.tests[0].stdout, '6');
  assert.deepEqual(r.tests[0].expected, '5');
});

test('TLE, compile errors and Python syntax errors', async () => {
  const tle = { ...ok(''), statusId: 5, status: 'Time Limit Exceeded' };
  assert.equal((await judgeCode({ language: 'cpp', code: 'x', tests }, { runner: fakeRunner([ok('5'), tle, tle]), queue: noQueue })).verdict, 'Time Limit Exceeded');

  const ce = { ...ok(''), statusId: 6, status: 'Compilation Error', compileOutput: 'main.cpp:1: error: expected ;' };
  const r = await judgeCode({ language: 'cpp', code: 'x', tests }, { runner: fakeRunner([ce, ce, ce]), queue: noQueue });
  assert.equal(r.verdict, 'Compile Error');
  assert.match(r.message, /expected ;/);

  const syntax = { ...ok(''), statusId: 11, status: 'Runtime Error (NZEC)', stderr: '  File "script.py", line 1\nSyntaxError: invalid syntax' };
  const py = await judgeCode({ language: 'python', code: 'x', tests }, { runner: fakeRunner([syntax, syntax, syntax]), queue: noQueue });
  assert.equal(py.verdict, 'Compile Error');
  // The same stderr from C++ is a real runtime error (C++ syntax errors fail at compile time).
  const cpp = await judgeCode({ language: 'cpp', code: 'x', tests }, { runner: fakeRunner([syntax, syntax, syntax]), queue: noQueue });
  assert.equal(cpp.verdict, 'Runtime Error');
});

test('time limits per language', () => {
  assert.equal(timeLimitFor('cpp', 2), 2);
  assert.equal(timeLimitFor('java', 2), 4.5);
  assert.equal(timeLimitFor('python', 2), 7.5);
  assert.equal(timeLimitFor('javascript', 2), 5.5);
  assert.equal(timeLimitFor('python', 10), 15, 'capped at 15 s');
});

test('the queue never runs more than N jobs at once and reports positions', async () => {
  const q = createQueue(2);
  let running = 0;
  let peak = 0;
  const positions = [];
  const job = () =>
    new Promise((resolve) => {
      running += 1;
      peak = Math.max(peak, running);
      setTimeout(() => {
        running -= 1;
        resolve('done');
      }, 20);
    });
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => q.add(job, (p) => positions.push(p))));
  assert.equal(peak, 2);
  assert.deepEqual(results, ['done', 'done', 'done', 'done', 'done']);
  assert.deepEqual(positions, [0, 0, 1, 2, 3]);
});
