// Unit tests for "never trust the tests": the reference solution checks every example and hidden test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyProblem, refreshVerification, problemFingerprint } from '../src/judge/verifyProblem.js';

// A fake judge that "runs" a + b on every input, so we know exactly what the solution prints.
const sumJudge = async ({ tests }) => {
  const per = tests.map((t) => {
    const [a, b] = t.input.split(' ').map(Number);
    const out = String(a + b);
    return { verdict: out === t.output.trim() ? 'Accepted' : 'Wrong Answer', input: t.input, expected: t.output, stdout: out, stderr: '' };
  });
  const bad = per.find((p) => p.verdict !== 'Accepted');
  return { verdict: bad ? bad.verdict : 'Accepted', verdictCode: bad ? 'WA' : 'AC', tests: per, timeMs: 1 };
};

const problem = (overrides = {}) => ({
  title: 'Sum',
  statement: 'Add',
  examples: [{ input: '2 3', output: '5' }],
  tests: [
    { input: '1 1', output: '2' },
    { input: '5 5', output: '11' }, // wrong on purpose
    { input: '0 0', output: '0' },
  ],
  referenceSolution: { language: 'python', code: 'print(sum(map(int, input().split())))' },
  timeLimitSec: 2,
  ...overrides,
});

test('a hidden test the reference solution fails is dropped', async () => {
  const r = await verifyProblem(problem(), { judge: sumJudge });
  assert.equal(r.verification.status, 'verified');
  assert.equal(r.problem.tests.length, 2);
  assert.equal(r.dropped.length, 1);
  assert.equal(r.dropped[0].test, 2);
  assert.equal(r.dropped[0].got, '10');
  assert.match(r.verification.notes[0], /Dropped 1 hidden test/);
});

test('a failing example flags the problem and drops nothing', async () => {
  const r = await verifyProblem(problem({ examples: [{ input: '2 3', output: '6' }] }), { judge: sumJudge });
  assert.equal(r.verification.status, 'flagged');
  assert.equal(r.problem.tests.length, 3, 'tests untouched when the solution is suspect');
  assert.match(r.verification.notes[0], /Example 1/);
});

test('too few surviving tests flags the problem (AI drafts need 5)', async () => {
  const r = await verifyProblem(problem(), { judge: sumJudge, minTests: 5 });
  assert.equal(r.verification.status, 'flagged');
  assert.match(r.verification.notes.at(-1), /need at least 5/);
});

test('a solution that fails every hidden test drops nothing', async () => {
  const r = await verifyProblem(problem({ tests: [{ input: '1 1', output: '3' }] }), { judge: sumJudge });
  assert.equal(r.verification.status, 'flagged');
  assert.equal(r.problem.tests.length, 1);
});

test('compile errors and missing solutions', async () => {
  const ceJudge = async () => ({ verdict: 'Compile Error', verdictCode: 'CE', message: 'SyntaxError: bad', tests: [] });
  const r = await verifyProblem(problem(), { judge: ceJudge });
  assert.equal(r.verification.status, 'flagged');
  assert.match(r.verification.notes[0], /does not compile/);

  const none = await verifyProblem(problem({ referenceSolution: { language: 'python', code: '  ' } }), { judge: sumJudge });
  assert.equal(none.verification.status, 'unverified');
});

test('editing tests after a check resets the badge to unverified', async () => {
  const r = await verifyProblem(problem(), { judge: sumJudge });
  const saved = { ...r.problem, verification: r.verification };
  assert.equal(refreshVerification(saved).status, 'verified');
  const edited = { ...saved, tests: [...saved.tests, { input: '9 9', output: '18' }] };
  assert.equal(refreshVerification(edited).status, 'unverified');
  assert.notEqual(problemFingerprint(saved), problemFingerprint(edited));
});
