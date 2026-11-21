// Unit tests for AI problem drafts (fake model + the real verifyProblem with a fake judge).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateProblem, validateProblemDraft } from '../src/ai/problemGenerator.js';
import { verifyProblem } from '../src/judge/verifyProblem.js';
import { aiLogSettings } from '../src/ai/aiLog.js';

aiLogSettings.enabled = false;

// A fake judge whose "program" prints a + b for every input.
const sumJudge = async ({ tests }) => {
  const per = tests.map((t) => {
    const [a, b] = t.input.split(' ').map(Number);
    const out = String(a + b);
    return { verdict: out === t.output.trim() ? 'Accepted' : 'Wrong Answer', input: t.input, expected: t.output, stdout: out, stderr: '' };
  });
  return { verdict: 'x', verdictCode: per.every((p) => p.verdict === 'Accepted') ? 'AC' : 'WA', tests: per, timeMs: 1 };
};
const verify = (problem, opts) => verifyProblem(problem, { ...opts, judge: sumJudge });

// A good AI draft for "add two numbers"; `wrongTests` hidden tests have a wrong expected output.
function draft({ wrongTests = 0, badExample = false } = {}) {
  const tests = Array.from({ length: 10 }, (_, i) => ({ input: `${i} ${i + 1}`, output: String(2 * i + 1 + (i < wrongTests ? 100 : 0)) }));
  return {
    title: 'Add two numbers',
    statement: 'Read two integers a and b and print their sum a + b.',
    inputFormat: 'Two integers on one line.',
    outputFormat: 'One integer.',
    constraints: '|a|, |b| <= 1000',
    examples: [
      { input: '2 3', output: badExample ? '6' : '5', explanation: '2 + 3 = 5' },
      { input: '10 -4', output: '6', explanation: '' },
    ],
    tests,
    referenceSolution: 'a, b = map(int, input().split())\nprint(a + b)',
  };
}

test('validateProblemDraft enforces the shape', () => {
  assert.deepEqual(validateProblemDraft(draft()).problems, []);
  const fewTests = { ...draft(), tests: draft().tests.slice(0, 3) };
  assert.ok(validateProblemDraft(fewTests).problems.some((p) => /at least 8/.test(p)));
  const dupes = { ...draft(), tests: draft().tests.map(() => ({ input: '1 1', output: '2' })) };
  assert.ok(validateProblemDraft(dupes).problems.some((p) => /different inputs/.test(p)));
  assert.deepEqual(validateProblemDraft({ __notJson: 'x' }).problems, ['The response was not valid JSON']);
});

test('wrong hidden tests are dropped and reported; the rest is verified', async () => {
  const ai = async () => ({ data: draft({ wrongTests: 2 }), model: 'fake', ms: 1 });
  const r = await generateProblem({ topic: 'sum', difficulty: 'easy' }, { ai, verify });
  assert.equal(r.verification.status, 'verified');
  assert.equal(r.problem.tests.length, 8);
  assert.equal(r.dropped.length, 2);
  assert.equal(r.meta.attempts, 1);
  assert.equal(r.problem.referenceSolution.language, 'python');
});

test('a broken shape is retried once with the list of problems', async () => {
  const prompts = [];
  const ai = async (prompt) => {
    prompts.push(prompt);
    return { data: prompts.length === 1 ? { title: 'x' } : draft(), model: 'fake', ms: 1 };
  };
  const r = await generateProblem({ topic: 'sum', difficulty: 'easy' }, { ai, verify });
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /Your last answer had these problems/);
  assert.equal(r.verification.status, 'verified');
});

test('a failing example triggers one retry with what went wrong', async () => {
  const prompts = [];
  const ai = async (prompt) => {
    prompts.push(prompt);
    return { data: draft({ badExample: prompts.length === 1 }), model: 'fake', ms: 1 };
  };
  const r = await generateProblem({ topic: 'sum', difficulty: 'easy' }, { ai, verify });
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /Example 1/);
  assert.equal(r.verification.status, 'verified');
});

test('still bad after the retry -> returned flagged (not thrown); too few tests flagged', async () => {
  const ai = async () => ({ data: draft({ wrongTests: 7 }), model: 'fake', ms: 1 }); // only 3 survive
  const r = await generateProblem({ topic: 'sum', difficulty: 'easy' }, { ai, verify });
  assert.equal(r.verification.status, 'flagged');
  assert.equal(r.meta.attempts, 2);
  assert.ok(r.verification.notes.some((n) => /need at least 5/.test(n)));
});

test('garbage twice -> GENERATION_FAILED', async () => {
  const ai = async () => ({ data: { __notJson: '???' }, model: 'fake', ms: 1 });
  await assert.rejects(generateProblem({ topic: 'sum', difficulty: 'easy' }, { ai, verify }), (err) => err.extra.code === 'GENERATION_FAILED');
});
